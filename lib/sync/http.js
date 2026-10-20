// ============================================================================
// Minimal HTTP client for outbound integration calls.
//
// Every requirement that makes an external call safe lives here:
//   - a hard per-request timeout (an API that hangs must not consume the
//     whole serverless invocation)
//   - bounded retries with exponential backoff and jitter
//   - Retry-After / X-RateLimit-Reset awareness instead of hammering
//   - retries only for genuinely transient failures (never 401/403/404)
//
// It is a factory rather than a bare function so tests can inject the fetch
// implementation, the clock and sleep, keeping the suite offline and instant.
// ============================================================================
'use strict';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BUDGET_MS = 15000;
const BASE_BACKOFF_MS = 250;
const MAX_WAIT_MS = 4000;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

class SyncHttpError extends Error {
  constructor(message, options) {
    super(message);
    const opts = options || {};
    this.name = 'SyncHttpError';
    this.code = opts.code || 'SYNC_HTTP_ERROR';
    this.status = opts.status || 0;
    this.rateLimitReset = opts.rateLimitReset || null;
    this.attempts = opts.attempts || 0;
    this.retryable = !!opts.retryable;
    this.expose = true;
  }
}

function parseRetryAfter(headers) {
  if (!headers || typeof headers.get !== 'function') return null;

  const raw = headers.get('retry-after');
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const when = Date.parse(raw);
    if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  }

  // GitHub signals exhausted quota with X-RateLimit-Remaining: 0 and a reset
  // timestamp in epoch seconds.
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  if (remaining === '0' && reset) {
    const resetAt = Number(reset);
    if (Number.isFinite(resetAt)) return Math.max(0, resetAt * 1000 - Date.now());
  }

  return null;
}

function readRateLimit(headers) {
  if (!headers || typeof headers.get !== 'function') return null;
  const limit = Number(headers.get('x-ratelimit-limit'));
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(limit) && !Number.isFinite(remaining)) return null;
  return {
    limit: Number.isFinite(limit) ? limit : null,
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: Number.isFinite(reset) ? new Date(reset * 1000) : null,
  };
}

function backoffMs(attempt, waitHintMs) {
  const exponential = BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 100);
  const target = waitHintMs !== null && waitHintMs !== undefined ? waitHintMs : exponential;
  return Math.min(target, MAX_WAIT_MS) + jitter;
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createHttp(options) {
  const opts = options || {};
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const sleep = opts.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = opts.now || (() => Date.now());

  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available.');
  }

  async function once(url, requestOptions, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: requestOptions.method || 'GET',
        headers: requestOptions.headers || {},
        body: requestOptions.body,
        signal: controller.signal,
        redirect: 'error',
      });

      const text = await response.text();

      return {
        response,
        status: response.status,
        headers: response.headers,
        body: safeJson(text),
        text,
      };
    } catch (err) {
      if (timedOut || (err && err.name === 'AbortError')) {
        throw new SyncHttpError('The upstream API timed out.', { code: 'SYNC_TIMEOUT', retryable: true });
      }
      throw new SyncHttpError('Could not reach the upstream API.', { code: 'SYNC_NETWORK', retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(url, requestOptions) {
    const ro = requestOptions || {};
    const attempts = Math.max(1, ro.attempts || DEFAULT_ATTEMPTS);
    const timeoutMs = ro.timeoutMs || DEFAULT_TIMEOUT_MS;
    const budgetMs = ro.budgetMs || DEFAULT_BUDGET_MS;
    const deadline = now() + budgetMs;

    let lastError = null;
    let waitHint = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (now() > deadline) break;

      try {
        const result = await once(url, ro, timeoutMs);

        if (result.status >= 200 && result.status < 300) {
          return { ...result, attempts: attempt, rateLimit: readRateLimit(result.headers) };
        }

        waitHint = parseRetryAfter(result.headers);
        const exhaustedQuota =
          result.status === 403 && result.headers.get('x-ratelimit-remaining') === '0';

        const error = new SyncHttpError(
          exhaustedQuota
            ? 'The upstream API rate limit is exhausted.'
            : 'The upstream API responded with HTTP ' + result.status + '.',
          {
            code: exhaustedQuota
              ? 'SYNC_RATE_LIMITED'
              : result.status === 401
                ? 'SYNC_UNAUTHORIZED'
                : result.status === 403
                  ? 'SYNC_FORBIDDEN'
                  : result.status === 404
                    ? 'SYNC_NOT_FOUND'
                    : 'SYNC_HTTP_ERROR',
            status: result.status,
            attempts: attempt,
            rateLimitReset: exhaustedQuota && waitHint !== null ? new Date(now() + waitHint) : null,
            retryable: RETRYABLE_STATUS.has(result.status) && !exhaustedQuota,
          }
        );

        // 401/403/404 are answers, not accidents: retrying cannot help.
        if (!error.retryable) throw error;

        lastError = error;
      } catch (err) {
        const syncError =
          err instanceof SyncHttpError
            ? err
            : new SyncHttpError('Unexpected failure calling the upstream API.', { code: 'SYNC_HTTP_ERROR' });

        if (!syncError.retryable) throw syncError;

        // A timeout/network failure carries no server hint, so fall back to
        // exponential backoff for the next attempt.
        waitHint = null;
        syncError.attempts = attempt;
        lastError = syncError;
      }

      if (attempt < attempts) {
        const wait = backoffMs(attempt, waitHint);
        waitHint = null;
        if (now() + wait > deadline) break;
        await sleep(wait);
      }
    }

    if (lastError) throw lastError;
    throw new SyncHttpError('The upstream API call ran out of time.', {
      code: 'SYNC_TIMEOUT',
      retryable: true,
    });
  }

  return { request, readRateLimit };
}

module.exports = {
  createHttp,
  SyncHttpError,
  readRateLimit,
  parseRetryAfter,
  backoffMs,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_ATTEMPTS,
  DEFAULT_BUDGET_MS,
};

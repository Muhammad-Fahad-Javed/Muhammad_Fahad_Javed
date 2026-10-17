// ============================================================================
// URL / scheme validation.
//
// The WHATWG URL parser accepts `javascript:`, `data:` and `vbscript:` URLs,
// so `new URL()` alone is NOT a security check. Every URL that is persisted
// and later rendered into an href/src must pass through these helpers.
// ============================================================================
'use strict';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// Characters that must never appear in a path we later interpolate into HTML.
const UNSAFE_PATH_CHARS = /[\s<>"'`\\]/;

function parseUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

// A same-site absolute path: exactly one leading slash. Protocol-relative
// ("//evil.com") is rejected because that resolves to another origin.
function isRelativePath(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^\/(?!\/)/.test(trimmed)) return false;
  return !UNSAFE_PATH_CHARS.test(trimmed);
}

function isHttpUrl(value) {
  const url = parseUrl(value);
  return !!url && HTTP_PROTOCOLS.has(url.protocol);
}

// Links (href) may be http(s), mailto: or tel:, plus same-site relative paths
// and in-page "#anchor" fragments.
function isSafeLinkUrl(value) {
  if (isRelativePath(value)) return true;
  if (typeof value === 'string' && /^#[A-Za-z0-9_-]*$/.test(value.trim())) return true;
  const url = parseUrl(value);
  if (!url) return false;
  return LINK_PROTOCOLS.has(url.protocol);
}

// Media (img src, PDF links) may be http(s) or a same-site relative path.
// Executable schemes (javascript:, data:, vbscript:, file:) are rejected.
function isSafeMediaUrl(value) {
  if (isRelativePath(value)) return true;
  return isHttpUrl(value);
}

function describeUnsafeUrl() {
  return 'must be an http(s) URL (or a site-relative path beginning with a single "/").';
}

module.exports = {
  parseUrl,
  isRelativePath,
  isHttpUrl,
  isSafeLinkUrl,
  isSafeMediaUrl,
  describeUnsafeUrl,
  HTTP_PROTOCOLS,
  LINK_PROTOCOLS,
};

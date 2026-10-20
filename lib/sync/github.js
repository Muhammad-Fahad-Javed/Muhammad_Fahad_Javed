// ============================================================================
// GitHub provider.
//
// Pure functions only: fetch a snapshot, then translate it into field updates.
// Nothing here touches the database, so the mapping rules are trivially
// testable against fixtures and no network call is needed in the suite.
//
// Deliberate limits, learned from the live account this portfolio belongs to:
//   - `bio`, `company` and `location` are null there, and 16 of 20 repos have
//     no description. Translating those into writes would erase hand-written
//     copy, so the mapping marks prose as `fill-only` and the engine refuses to
//     overwrite non-empty values with empty ones.
//   - Private repositories are filtered out even when an authenticated token
//     could read them. A portfolio must never publish private data by accident.
//   - Pagination is capped so one sync can always finish inside a serverless
//     invocation.
// ============================================================================
'use strict';

const { createHttp } = require('./http');

const API_BASE = 'https://api.github.com';
const PER_PAGE = 100;
const MAX_PAGES = 3;
const MAX_TECHNOLOGIES = 12;

function githubHeaders(token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'fahad-portfolio-sync',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = 'Bearer ' + token;
  return headers;
}

// Pulls the rel="next" URL out of a Link header.
function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  for (const part of String(linkHeader).split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match && match[2] === 'next') return match[1];
  }
  return null;
}

// The token travels in the Authorization header, so a next-page URL is only
// followed if it stays on the GitHub API origin. This closes the door on a
// forged Link header siphoning the token to another host.
function isApiUrl(url) {
  return typeof url === 'string' && url.startsWith(API_BASE + '/');
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Only the fields the portfolio uses, and never a private repository.
function sanitiseRepo(repo) {
  if (!repo || typeof repo !== 'object' || repo.private) return null;
  const name = text(repo.name);
  if (!name) return null;

  const updated = text(repo.updated_at);
  const updatedAt = updated ? new Date(updated) : null;

  return {
    name,
    fullName: text(repo.full_name) || name,
    description: text(repo.description),
    htmlUrl: text(repo.html_url),
    language: text(repo.language),
    topics: Array.isArray(repo.topics) ? repo.topics.map(text).filter(Boolean) : [],
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
    stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
    fork: !!repo.fork,
    archived: !!repo.archived,
  };
}

async function fetchGithubSnapshot(options) {
  const opts = options || {};
  const client = opts.http || createHttp();
  const login = text(opts.username);
  const maxPages = opts.maxPages || MAX_PAGES;

  if (!login) throw new Error('A GitHub username is required.');

  const headers = githubHeaders(opts.token);

  const userRes = await client.request(API_BASE + '/users/' + encodeURIComponent(login), {
    headers,
    timeoutMs: 5000,
    attempts: 3,
    budgetMs: 8000,
  });

  const profile = userRes.body;
  if (!profile || typeof profile !== 'object' || !text(profile.login)) {
    throw new Error('Unexpected response from the GitHub users API.');
  }

  const repos = [];
  let url =
    API_BASE +
    '/users/' +
    encodeURIComponent(login) +
    '/repos?per_page=' +
    PER_PAGE +
    '&sort=updated&type=owner';

  for (let page = 0; page < maxPages && url; page += 1) {
    const res = await client.request(url, {
      headers,
      timeoutMs: 5000,
      attempts: 2,
      budgetMs: 8000,
    });

    const batch = Array.isArray(res.body) ? res.body : [];
    for (const raw of batch) {
      const repo = sanitiseRepo(raw);
      if (repo) repos.push(repo);
    }

    const next = nextPageUrl(res.headers && res.headers.get ? res.headers.get('link') : null);
    url = isApiUrl(next) ? next : null;
  }

  return {
    profile,
    repos,
    rateLimit: userRes.rateLimit || null,
    truncated: Boolean(url),
  };
}

function technologiesFor(repo) {
  const list = [];
  const seen = new Set();
  for (const value of [repo.language, ...(repo.topics || [])]) {
    const name = text(value);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(name);
    if (list.length >= MAX_TECHNOLOGIES) break;
  }
  return list;
}

/**
 * Translates a snapshot into engine updates.
 *
 * @param {object}   input
 * @param {object}   input.profile   Raw GitHub user object
 * @param {Array}    input.repos     Sanitised repositories
 * @param {Array}    input.projects  [{ id, githubRepo }] — the featured allowlist
 * @param {boolean} [input.syncAvatar] Replace the profile photo with the GitHub avatar
 */
function mapGithubUpdates(input) {
  const opts = input || {};
  const profile = opts.profile || {};
  const repos = Array.isArray(opts.repos) ? opts.repos : [];
  const projects = Array.isArray(opts.projects) ? opts.projects : [];
  const updates = [];

  const push = (entity, entityId, field, value, policy) => {
    updates.push({ entity, entityId: entityId || '', field, value, policy });
  };

  const login = text(profile.login);

  // ---- Profile-level fields ------------------------------------------------
  // `login` casing comes from GitHub so API links always resolve.
  push('github', '', 'username', login, 'overwrite');
  push('github', '', 'profileUrl', text(profile.html_url) || (login ? 'https://github.com/' + login : ''), 'overwrite');

  // Prose is fill-only: this account returns null for both, which must never
  // blank the copy already on the site.
  push('github', '', 'bio', text(profile.bio), 'fill-only');
  push('github', '', 'location', text(profile.location), 'fill-only');

  push('profile', '', 'fullName', text(profile.name), 'overwrite');

  // Opt-in only: a 198px GitHub avatar should not silently replace a curated
  // headshot. The admin turns this on deliberately.
  if (opts.syncAvatar) {
    push('profile', '', 'profileImage', text(profile.avatar_url), 'overwrite');
  }

  // ---- Featured projects (the allowlist) -----------------------------------
  const byFullName = new Map();
  for (const repo of repos) {
    byFullName.set(repo.fullName.toLowerCase(), repo);
    byFullName.set(repo.name.toLowerCase(), repo);
  }

  for (const project of projects) {
    const key = text(project.githubRepo).toLowerCase();
    if (!key) continue;

    const repo = byFullName.get(key);
    if (!repo) continue;

    if (repo.htmlUrl) push('project', project.id, 'githubUrl', repo.htmlUrl, 'overwrite');
    if (repo.updatedAt) push('project', project.id, 'repoUpdatedAt', repo.updatedAt, 'overwrite');

    // Never replace a written description with a one-liner, or a curated
    // technology list with a bare language name.
    push('project', project.id, 'shortDesc', repo.description, 'fill-only');
    push('project', project.id, 'technologies', technologiesFor(repo), 'fill-only');
  }

  return updates;
}

module.exports = {
  fetchGithubSnapshot,
  mapGithubUpdates,
  sanitiseRepo,
  technologiesFor,
  nextPageUrl,
  isApiUrl,
  githubHeaders,
  API_BASE,
  MAX_PAGES,
};

// ============================================================================
// Content-quality guards for the seeded default copy.
//
// The professional-copy pass touched prisma/content-defaults.js; these tests
// keep it from drifting back into doubled spaces, stray whitespace, hyphens
// used as dashes, or the abbreviations the rest of the site spells out.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const defaults = require('../prisma/content-defaults');

// Values that are machine identifiers rather than prose.
const IDENTIFIER_FIELDS = new Set([
  'key', 'sectionId', 'icon', 'image', 'url', 'avatar', 'buttonUrl', 'profileUrl',
]);

function collectProse(value, field, out) {
  if (typeof value === 'string') {
    if (!IDENTIFIER_FIELDS.has(field)) out.push({ field, value });
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectProse(entry, field, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) collectProse(nested, key, out);
  }
}

function prose() {
  const out = [];
  collectProse(defaults, '', out);
  return out;
}

test('content-quality: default copy has no doubled or stray whitespace', () => {
  for (const { field, value } of prose()) {
    if (!value.trim()) continue;
    assert.ok(!/  +/.test(value), `${field} has a doubled space: ${JSON.stringify(value)}`);
    assert.equal(value, value.trim(), `${field} has untidy whitespace: ${JSON.stringify(value)}`);
  }
});

test('content-quality: default copy never uses a hyphen where a dash belongs', () => {
  for (const { field, value } of prose()) {
    assert.ok(
      !/[\p{L}\p{N}] - [\p{L}\p{N}]/u.test(value),
      `${field} uses a hyphen as a dash: ${JSON.stringify(value)}`
    );
  }
});

test('content-quality: default copy avoids the abbreviations the site spells out elsewhere', () => {
  const banned = [
    [/\bMgmt\b/, 'Mgmt'],
    [/\bGovt\./, 'Govt.'],
    [/\bJS\b/, 'JS'],
    [/\breligiously\b/, 'religiously'],
    [/\bgo to-market\b/, 'go to-market'],
    [/systems development, OOP,/, 'OOP in running prose'],
  ];
  for (const { field, value } of prose()) {
    for (const [pattern, label] of banned) {
      assert.ok(!pattern.test(value), `${field} still contains "${label}": ${JSON.stringify(value)}`);
    }
  }
});

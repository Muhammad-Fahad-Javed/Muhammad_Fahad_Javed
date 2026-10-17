// ============================================================================
// Stage 2 — sanitisation, URL scheme validation, attribute-injection safety
// and prototype-key hardening. Covers A2, A3, A4, A5, A7 (data), C7, B1, D7.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createFakePrisma } = require('./helpers/fake-prisma');
const { loadModule } = require('./helpers/harness');

const sanitize = loadModule('lib/sanitize.js', createFakePrisma());
const urls = loadModule('lib/urls.js', createFakePrisma());
const resources = loadModule('lib/resources.js', createFakePrisma());

// ---------------------------------------------------------------------------
// A2 / C7 — parser-based HTML sanitisation
// ---------------------------------------------------------------------------

test('A2/C7: sanitizeHtml strips scripts, event handlers and unsafe schemes', () => {
  assert.equal(sanitize.sanitizeHtml('<script>alert(1)</script>hello'), 'hello');
  assert.equal(sanitize.sanitizeHtml('<img src=x onerror=alert(1)>'), '');
  assert.equal(sanitize.sanitizeHtml('<p onclick="steal()">text</p>'), '<p>text</p>');

  const link = sanitize.sanitizeHtml('<a href="javascript:alert(1)">click</a>');
  assert.ok(!/javascript/i.test(link), link);
  assert.match(link, /rel="noopener noreferrer nofollow"/);

  const dataUri = sanitize.sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
  assert.ok(!/data:/i.test(dataUri), dataUri);

  // Bypass attempts that defeated the old regex sanitizer.
  assert.ok(!/script/i.test(sanitize.sanitizeHtml('<scr<script>ipt>alert(1)</scr</script>ipt>')));
  assert.ok(!/onerror/i.test(sanitize.sanitizeHtml('<img/src=x/onerror=alert(1)>')));
  assert.ok(!/<iframe/i.test(sanitize.sanitizeHtml('<iframe src="https://evil.example"></iframe>')));
  assert.ok(!/<object/i.test(sanitize.sanitizeHtml('<object data="evil"></object>')));
  assert.ok(!/<style/i.test(sanitize.sanitizeHtml('<style>body{background:url(evil)}</style>')));
});

test('A2/C7: sanitizeHtml preserves legitimate formatting', () => {
  const input = '<p>Hello <strong>world</strong> &amp; <em>friends</em></p><ul><li>one</li></ul>';
  const out = sanitize.sanitizeHtml(input);
  assert.match(out, /<strong>world<\/strong>/);
  assert.match(out, /<em>friends<\/em>/);
  assert.match(out, /<li>one<\/li>/);
});

test('A2/C7: sanitizeHtmlArray handles non-string and null entries', () => {
  const out = sanitize.sanitizeHtmlArray(['<b>ok</b>', null, undefined, 42, { a: 1 }]);
  assert.equal(out.length, 5);
  assert.ok(!out.some((entry) => typeof entry !== 'string'));
  assert.equal(out[0], '<b>ok</b>');
});

// ---------------------------------------------------------------------------
// A4 — URL scheme validation
// ---------------------------------------------------------------------------

test('A4: executable schemes are rejected everywhere', () => {
  const bad = ['javascript:alert(1)', 'JavaScript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>', 'file:///etc/passwd'];
  for (const value of bad) {
    assert.equal(urls.isHttpUrl(value), false, value);
    assert.equal(urls.isSafeMediaUrl(value), false, value);
    assert.equal(urls.isSafeLinkUrl(value), false, value);
  }
});

test('A4: isHttpUrl only accepts http(s)', () => {
  assert.equal(urls.isHttpUrl('https://example.com/a?b=1#c'), true);
  assert.equal(urls.isHttpUrl('http://example.com'), true);
  assert.equal(urls.isHttpUrl('mailto:a@b.c'), false);
  assert.equal(urls.isHttpUrl('/uploads/a.png'), false);
  assert.equal(urls.isHttpUrl('not a url'), false);
});

test('A4: links allow mailto/tel/#anchor but media does not', () => {
  assert.equal(urls.isSafeLinkUrl('mailto:a@b.c'), true);
  assert.equal(urls.isSafeLinkUrl('tel:+123456'), true);
  assert.equal(urls.isSafeLinkUrl('#contact'), true);
  assert.equal(urls.isSafeLinkUrl('/resume.pdf'), true);

  assert.equal(urls.isSafeMediaUrl('mailto:a@b.c'), false);
  assert.equal(urls.isSafeMediaUrl('tel:+123456'), false);
  assert.equal(urls.isSafeMediaUrl('#contact'), false);
});

test('A4: protocol-relative URLs are rejected (they leave the origin)', () => {
  assert.equal(urls.isRelativePath('//evil.example/x'), false);
  assert.equal(urls.isSafeLinkUrl('//evil.example/x'), false);
  assert.equal(urls.isSafeMediaUrl('//evil.example/x'), false);
  assert.equal(urls.isRelativePath('/local/x'), true);
});

// ---------------------------------------------------------------------------
// A3 / A5 — write-path sanitisation and attribute injection
// ---------------------------------------------------------------------------

const projectDef = resources.COLLECTIONS.projects;
const aboutDef = resources.SINGLETONS.about;
const heroDef = resources.SINGLETONS.hero;

test('A3: richtext values are sanitised on every write path', () => {
  const data = resources.buildWriteData(
    { title: 'P', fullDesc: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>' },
    projectDef
  );
  assert.ok(!/script/i.test(data.fullDesc));
  assert.ok(!/onerror/i.test(data.fullDesc));
  assert.match(data.fullDesc, /<p>ok<\/p>/);
});

test('A3: HTML-bearing JSON arrays are sanitised; structured entries are preserved', () => {
  const about = resources.buildWriteData(
    { paragraphs: ['<b>fine</b>', '<script>bad()</script>'], tags: [{ icon: 'fas fa-code', label: '<img src=x onerror=alert(1)>Dev' }] },
    aboutDef
  );
  const paragraphs = JSON.parse(about.paragraphs);
  assert.equal(paragraphs[0], '<b>fine</b>');
  assert.ok(!/script/i.test(paragraphs[1]));

  const tags = JSON.parse(about.tags);
  assert.equal(tags[0].icon, 'fas fa-code');
  assert.ok(!/onerror/i.test(tags[0].label));
  assert.match(tags[0].label, /Dev/);
});

test('A3: fields the public client renders as HTML are sanitised server-side', () => {
  // hero.statusText and about.heading are injected via innerHTML by the public
  // client (frontend/js/content-loader.js), so they carry `html: true` and must
  // be sanitised on write exactly like richtext fields. Without this, an author
  // could store markup that executes for every visitor (confirmed in a browser).
  const hero = resources.buildWriteData(
    { statusText: '<strong>Open</strong><script>alert(1)</script><img src=x onerror=alert(1)>' },
    heroDef
  );
  assert.match(hero.statusText, /<strong>Open<\/strong>/);
  assert.ok(!/script/i.test(hero.statusText), hero.statusText);
  assert.ok(!/onerror/i.test(hero.statusText), hero.statusText);

  const about = resources.buildWriteData(
    { heading: 'Software Engineer & Full Stack <img src=x onerror=alert(1)>' },
    aboutDef
  );
  assert.ok(!/onerror/i.test(about.heading), about.heading);
  // A literal ampersand becomes an entity; the client handles both forms.
  assert.match(about.heading, /&amp;/);
});

test('A3: html flag is set on exactly the innerHTML-injected fields', () => {
  const flagged = [];
  for (const def of Object.values(resources.SINGLETONS)) {
    for (const field of def.fields) if (field.html === true) flagged.push(field.name);
  }
  for (const def of Object.values(resources.COLLECTIONS)) {
    for (const field of def.fields) if (field.html === true) flagged.push(field.name);
  }
  assert.deepEqual(flagged.sort(), ['answer', 'body', 'heading', 'statusText']);
});

test('A5: dialog-style quotes in labels cannot break out of an attribute', () => {
  // buildWriteData for a plain text field keeps the raw text (it is rendered
  // via textContent in the UI), but the client escapeHtml helper escapes
  // quotes. Verify the server never turns text into markup.
  const data = resources.buildWriteData({ name: '"><script>alert(1)</script>', category: 'X' }, resources.COLLECTIONS.skills);
  assert.equal(data.name, '"><script>alert(1)</script>');
  assert.equal(resources.isJsonField('name'), false);
});

test('A4: validatePayload rejects unsafe URLs by field purpose', () => {
  const badProject = resources.validatePayload(
    { title: 'P', githubUrl: 'javascript:alert(1)' },
    projectDef
  );
  assert.ok(badProject.some((e) => /GitHub URL/.test(e)), badProject.join('; '));

  const badImage = resources.validatePayload({ title: 'P', image: 'mailto:a@b.c' }, projectDef);
  assert.ok(badImage.some((e) => /Cover Image/.test(e)), badImage.join('; '));

  const badGallery = resources.validatePayload({ title: 'P', images: ['javascript:alert(1)'] }, projectDef);
  assert.ok(badGallery.some((e) => /Gallery/.test(e)), badGallery.join('; '));

  const badCta = resources.validatePayload({ ctaUrl: 'javascript:alert(1)' }, heroDef);
  assert.ok(badCta.some((e) => /Primary Button URL/.test(e)), badCta.join('; '));

  // Legitimate values still pass.
  assert.deepEqual(resources.validatePayload({ title: 'P', githubUrl: 'https://github.com/a/b', image: '/uploads/a.png', images: ['https://cdn.example/a.png'] }, projectDef), []);
  assert.deepEqual(resources.validatePayload({ ctaUrl: '#contact', ctaSecondaryUrl: '/resume.pdf' }, heroDef), []);
});

test('C3: bounds are enforced on text and list lengths', () => {
  const tooLong = resources.validatePayload({ title: 'P', shortDesc: 'x'.repeat(20001) }, projectDef);
  assert.ok(tooLong.some((e) => /too long/.test(e)), tooLong.join('; '));

  const tooMany = resources.validatePayload({ title: 'P', images: new Array(500).fill('https://a/b.png') }, projectDef);
  assert.ok(tooMany.some((e) => /too many entries/.test(e)), tooMany.join('; '));
});

test('B7/C3: coercion keeps numbers and booleans sane', () => {
  const num = resources.buildWriteData({ name: 'S', category: 'C', level: 'not-a-number' }, resources.COLLECTIONS.skills);
  assert.equal(num.level, 0);
  const good = resources.buildWriteData({ name: 'S', category: 'C', level: '77.9' }, resources.COLLECTIONS.skills);
  assert.equal(good.level, 77);
});

test('D7: boolean coercion is a single shared implementation', () => {
  for (const truthy of [true, 1, 'true', 'YES', 'on', 'y']) {
    assert.equal(resources.coerceBoolean(truthy, false), true, String(truthy));
  }
  for (const falsy of [false, 0, 'false', 'NO', 'off', 'n']) {
    assert.equal(resources.coerceBoolean(falsy, true), false, String(falsy));
  }
  assert.equal(resources.coerceBoolean(undefined, true), true);
});

// ---------------------------------------------------------------------------
// B1 — prototype-key safety
// ---------------------------------------------------------------------------

test('B1: prototype keys never resolve to a registry entry', () => {
  const attacks = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf', 'unknown', '', null, undefined, 123, {}];
  for (const key of attacks) {
    assert.equal(resources.getCollection(key), null, `collection ${String(key)}`);
    assert.equal(resources.getSingleton(key), null, `singleton ${String(key)}`);
  }
  // Real keys still resolve.
  assert.ok(resources.getCollection('projects'));
  assert.ok(resources.getSingleton('profile'));
});

test('B1/D3: the registry validates every definition has the metadata the UI needs', () => {
  for (const [key, def] of Object.entries(resources.COLLECTIONS)) {
    assert.ok(def.label, `${key}.label`);
    assert.ok(def.model, `${key}.model`);
    assert.ok(def.icon, `${key}.icon`);
    assert.ok(def.titleField, `${key}.titleField`);
    assert.ok(Array.isArray(def.fields) && def.fields.length > 0, `${key}.fields`);
    assert.ok(def.fields.some((f) => f.name === def.titleField), `${key}.titleField must exist in fields`);
    if (def.imageField) assert.ok(def.fields.some((f) => f.name === def.imageField), `${key}.imageField must exist in fields`);
  }
  for (const [key, def] of Object.entries(resources.SINGLETONS)) {
    assert.ok(def.label, `${key}.label`);
    assert.ok(def.icon, `${key}.icon`);
    assert.ok(Array.isArray(def.fields) && def.fields.length > 0, `${key}.fields`);
  }
});

test('B6: the client registry is generated from the server registry', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { ROOT } = require('./helpers/harness');
  const clientFile = fs.readFileSync(path.join(ROOT, 'frontend', 'admin', 'js', 'resources.js'), 'utf8');
  assert.match(clientFile, /GENERATED FILE - DO NOT EDIT BY HAND/);

  // Every server field must appear in the generated client file with the
  // matching control type.
  for (const def of [...Object.values(resources.COLLECTIONS), ...Object.values(resources.SINGLETONS)]) {
    for (const field of def.fields) {
      assert.ok(clientFile.includes(JSON.stringify(field.name)), `${field.name} missing from client registry`);
    }
  }
  assert.ok(clientFile.includes('"link"'), 'link field type must reach the client registry');
  assert.ok(clientFile.includes('json-tags-obj'), 'object-shaped tag lists must reach the client registry');
});

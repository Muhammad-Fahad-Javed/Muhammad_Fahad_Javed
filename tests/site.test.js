const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');

test('exactly one H1, and it is the visible hero name', () => {
  assert.strictEqual((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<h1 class="name-os" id="hero-heading">MUHAMMAD<br>FAHAD JAVED<\/h1>/);
  assert.doesNotMatch(html, /class="seo-fallback"/);
});

test('single title, description and canonical in the initial HTML', () => {
  assert.strictEqual((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /<title>Muhammad Fahad Javed \| Computer Science Student &amp; Developer<\/title>/);
  assert.strictEqual((html.match(/<meta name="description"/g) || []).length, 1);
  assert.strictEqual((html.match(/rel="canonical"/g) || []).length, 1);
  assert.match(html, /rel="canonical" href="https:\/\/muhammadfahadjaved\.vercel\.app\/"/);
  assert.doesNotMatch(html, /name="robots" content="[^"]*noindex/);
});

test('Open Graph / Twitter tags use absolute https URLs', () => {
  for (const k of ['og:url', 'og:image', 'twitter:image']) {
    const m = html.match(new RegExp(`(?:property|name)="${k}" content="([^"]+)"`));
    assert.ok(m, k + ' missing');
    assert.match(m[1], /^https:\/\/muhammadfahadjaved\.vercel\.app\//);
  }
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'frontend', 'images', 'og-image.jpg')));
});

test('JSON-LD is valid JSON with consistent Person/ProfilePage ids and no unverified profiles', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const g = Object.fromEntries(ld['@graph'].map((n) => [n['@type'], n]));
  assert.strictEqual(g.ProfilePage.mainEntity['@id'], g.Person['@id']);
  assert.ok(g.Person.sameAs.every((u) => u.startsWith('https://')));
  assert.ok(!JSON.stringify(ld).includes('instagram'));
  assert.ok(!('dateModified' in g.ProfilePage));
});

test('no preload of files that do not exist', () => {
  assert.doesNotMatch(html, /fahadjaved\.profile\.webp/);
});

test('robots.txt and sitemap.xml reference the canonical host', () => {
  const root = path.join(__dirname, '..', 'frontend');
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/muhammadfahadjaved\.vercel\.app\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow:\s*\/\s*$/m);
  const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(sm, /<loc>https:\/\/muhammadfahadjaved\.vercel\.app\/<\/loc>/);
});

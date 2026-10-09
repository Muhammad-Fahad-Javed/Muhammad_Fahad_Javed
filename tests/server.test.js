const test = require('node:test');
const assert = require('node:assert');
const { validateUpload, MAX_SIZE_BYTES } = require('../lib/storage');
const { SINGLETONS, validatePayload } = require('../lib/resources');
const { applySeoToHtml } = require('../scripts/inject-seo');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

test('upload validation: accepts real PNG, rejects spoofed/oversized/svg/empty', () => {
  assert.strictEqual(validateUpload({ contentType: 'image/png', size: PNG.length, buffer: PNG }), null);
  assert.ok(validateUpload({ contentType: 'image/png', size: 30, buffer: Buffer.from('<script>alert(1)</script>') }));
  assert.ok(validateUpload({ contentType: 'image/svg+xml', size: 30, buffer: Buffer.alloc(30) }));
  assert.ok(validateUpload({ contentType: 'image/png', size: MAX_SIZE_BYTES + 1, buffer: PNG }));
  assert.ok(validateUpload({ contentType: 'image/png', size: 0, buffer: Buffer.alloc(0) }));
});

test('3MB raw stays under Vercel 4.5MB body limit once base64-encoded', () => {
  assert.ok(Math.ceil(MAX_SIZE_BYTES / 3) * 4 + 1024 < 4.5 * 1024 * 1024);
});

test('URL/image fields reject javascript: and data: schemes', () => {
  const def = SINGLETONS.seo;
  assert.ok(validatePayload({ canonicalUrl: 'javascript:alert(1)' }, def).length);
  assert.ok(validatePayload({ ogImage: 'data:text/html,x' }, def).length);
  assert.strictEqual(validatePayload({ ogImage: '/images/og-image.jpg', canonicalUrl: 'https://muhammadfahadjaved.vercel.app/' }, def).length, 0);
});

const BASE = '<title>Old</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta name="twitter:title" content="old" /><meta property="og:image" content="https://muhammadfahadjaved.vercel.app/images/og-image.jpg" /><link rel="canonical" href="https://muhammadfahadjaved.vercel.app/" /><meta property="og:url" content="https://muhammadfahadjaved.vercel.app/" />';

test('SEO injection writes valid values and escapes HTML', () => {
  const out = applySeoToHtml(BASE, { siteTitle: 'A & B <x>', metaDescription: 'say "hi"', ogImage: '/images/new.jpg' });
  assert.match(out, /<title>A &amp; B &lt;x&gt;<\/title>/);
  assert.match(out, /content="say &quot;hi&quot;"/);
  assert.match(out, /og:image" content="https:\/\/muhammadfahadjaved\.vercel\.app\/images\/new\.jpg"/);
});

test('SEO injection ignores foreign canonicals, http images, empty values', () => {
  const out = applySeoToHtml(BASE, { canonicalUrl: 'https://evil.example/', ogImage: 'http://x.test/a.jpg', siteTitle: '', metaDescription: '' });
  assert.strictEqual(out, BASE);
  assert.strictEqual(applySeoToHtml(BASE, null), BASE);
});

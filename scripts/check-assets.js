// Reports every local asset referenced by frontend/index.html (+ css url())
// that does not exist in frontend/. Non-fatal by default so a missing image
// never blocks a deploy; use `node scripts/check-assets.js --strict` in CI.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'frontend');

function refsFrom(text, re) { const out = new Set(); let m; while ((m = re.exec(text))) out.add(m[1]); return out; }

function collect() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = new Set();
  for (const r of refsFrom(html, /\b(?:src|href|srcset)="([^"#?]+)"/g)) refs.add(r);
  for (const r of refsFrom(html, /https:\/\/muhammadfahadjaved\.vercel\.app(\/[^"'\s,)]+)/g)) refs.add(r);
  const cssPath = path.join(ROOT, 'css', 'style.css');
  if (fs.existsSync(cssPath)) for (const r of refsFrom(fs.readFileSync(cssPath, 'utf8'), /url\(['"]?([^'")]+)['"]?\)/g)) refs.add(r);
  return [...refs].filter((r) => r && !/^(https?:|data:|mailto:|tel:|\/\/|javascript:)/i.test(r) && !r.startsWith('#'));
}

function check() {
  const missing = []; const ok = [];
  for (const r of collect()) {
    const rel = r.replace(/^\//, '');
    if (!/\.(png|jpe?g|webp|avif|gif|svg|pdf|ico|css|js|json|xml|txt|html)$/i.test(rel)) continue;
    (fs.existsSync(path.join(ROOT, rel)) ? ok : missing).push(r);
  }
  return { ok, missing };
}

if (require.main === module) {
  const { ok, missing } = check();
  console.log(`check-assets: ${ok.length} local references resolve, ${missing.length} are MISSING from frontend/:`);
  missing.sort().forEach((m) => console.log('  - ' + m));
  if (missing.length && process.argv.includes('--strict')) process.exit(1);
}
module.exports = { check };

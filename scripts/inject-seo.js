// Build-time SEO injection.
//
// Crawlers and social-preview bots read the INITIAL html, so CMS-managed SEO
// fields (title, description, canonical, Open Graph, Twitter) are written into
// frontend/index.html here, during the Vercel build, instead of being patched
// in the browser by JavaScript. If the database is unreachable or the fields
// are empty/invalid, the hand-written metadata already in index.html is kept.
//
// Consequence: editing the "SEO" page in the dashboard takes effect after the
// next deployment (Vercel > Deployments > Redeploy, or push to GitHub).
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SITE = 'https://muhammadfahadjaved.vercel.app';
const HTML_PATH = path.join(__dirname, '..', 'frontend', 'index.html');

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function absoluteImage(v) {
  if (!v) return null;
  if (v.startsWith('/') && !v.startsWith('//')) return SITE + v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

function setMeta(html, attrName, attrValue, content) {
  const re = new RegExp(`(<meta\\s+${attrName}="${attrValue}"\\s+content=")[^"]*(")`, 'i');
  return re.test(html) ? html.replace(re, `$1${escAttr(content)}$2`) : html;
}

function applySeoToHtml(html, seo) {
  if (!seo) return html;
  const title = (seo.siteTitle || '').trim();
  const desc = (seo.metaDescription || '').trim();
  const ogTitle = (seo.ogTitle || '').trim() || title;
  const ogDesc = (seo.ogDescription || '').trim() || desc;
  const image = absoluteImage((seo.ogImage || '').trim());

  if (title && title.length <= 120) {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escText(title)}</title>`);
  }
  if (desc && desc.length <= 320) html = setMeta(html, 'name', 'description', desc);
  if (ogTitle && ogTitle.length <= 120) {
    html = setMeta(html, 'property', 'og:title', ogTitle);
    html = setMeta(html, 'name', 'twitter:title', ogTitle);
  }
  if (ogDesc && ogDesc.length <= 320) {
    html = setMeta(html, 'property', 'og:description', ogDesc);
    html = setMeta(html, 'name', 'twitter:description', ogDesc);
  }
  if (image) {
    html = setMeta(html, 'property', 'og:image', image);
    html = setMeta(html, 'name', 'twitter:image', image);
  }
  // Canonical is only accepted for this site's own host; anything else is ignored.
  try {
    const c = new URL((seo.canonicalUrl || '').trim());
    if (c.origin === SITE) {
      html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${escAttr(c.origin + c.pathname)}$2`);
      html = setMeta(html, 'property', 'og:url', c.origin + c.pathname);
    }
  } catch { /* keep static canonical */ }
  return html;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('inject-seo: DATABASE_URL not set - keeping static metadata.');
    return;
  }
  const prisma = require('../lib/db');
  try {
    const seo = await prisma.seoSettings.findUnique({ where: { id: 'singleton' } });
    const before = fs.readFileSync(HTML_PATH, 'utf8');
    const after = applySeoToHtml(before, seo);
    if (after !== before) fs.writeFileSync(HTML_PATH, after);
    console.log(`inject-seo: ${after !== before ? 'CMS SEO written into index.html' : 'no changes'}.`);
  } catch (err) {
    console.warn('inject-seo: could not read SEO settings, keeping static metadata:', err.message);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) main().then(() => process.exit(0));
module.exports = { applySeoToHtml };

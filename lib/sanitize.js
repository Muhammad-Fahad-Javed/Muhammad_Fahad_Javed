// Minimal allow-list HTML sanitizer for the lightweight rich-text editor.
// The editor only ever produces <b><i><u><ul><ol><li><a><h3><h4><p><br> tags,
// but we sanitize server-side too since content could arrive from any API
// client, not just our own admin UI.
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'h4', 'p', 'br'];

function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';

  // Strip script/style blocks entirely (including content).
  let html = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Remove any tag not in the allow-list, keeping its inner text.
  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.includes(lower)) return '';
    if (lower === 'a') {
      const hrefMatch = /href\s*=\s*["']([^"']*)["']/i.exec(attrs || '');
      let href = hrefMatch ? hrefMatch[1] : '#';
      if (!/^https?:\/\//i.test(href) && !href.startsWith('#') && !href.startsWith('mailto:')) {
        href = '#';
      }
      return match.startsWith('</') ? '</a>' : `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
    }
    return match.startsWith('</') ? `</${lower}>` : `<${lower}>`;
  });

  // Strip any leftover on* attributes / javascript: URLs just in case.
  html = html.replace(/on\w+\s*=\s*"[^"]*"/gi, '').replace(/javascript:/gi, '');

  return html;
}

module.exports = { sanitizeHtml };

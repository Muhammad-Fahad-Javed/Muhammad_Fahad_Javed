// ============================================================================
// Rich-text sanitisation.
//
// Replaces the previous hand-rolled regex sanitiser (which was bypassable and
// applied inconsistently) with `sanitize-html`, a maintained parser-based
// allow-list sanitiser. The allow-list matches what the lightweight editor can
// actually produce, so legitimate formatting survives unchanged.
//
// Every write path that can persist HTML must call this: individual resource
// endpoints, singleton endpoints, bulk/import, and JSON fields that hold HTML.
// ============================================================================
'use strict';

const sanitizeHtmlLib = require('sanitize-html');

const ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'br',
  'ul', 'ol', 'li', 'p', 'blockquote',
  'h3', 'h4', 'a',
];

const OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
  },
  // Only these protocols may appear in an href. Relative hrefs are allowed by
  // sanitize-html but protocol-relative ("//host") is explicitly disallowed.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Force safe link attributes; strip any incoming target/rel first.
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href || '#';
      return {
        tagName: 'a',
        attribs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' },
      };
    },
  },
};

function sanitizeHtml(input) {
  if (typeof input !== 'string' || input === '') return '';
  return sanitizeHtmlLib(input, OPTIONS);
}

// Sanitises an array whose entries may contain HTML. Non-string entries are
// stringified so a JSON payload cannot smuggle an object through.
function sanitizeHtmlArray(list) {
  if (!Array.isArray(list)) return [];
  return list.map((entry) => sanitizeHtml(String(entry == null ? '' : entry)));
}

module.exports = {
  sanitizeHtml,
  sanitizeHtmlArray,
  ALLOWED_TAGS,
};

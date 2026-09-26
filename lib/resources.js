// ============================================================================
// Central resource registry.
//
// This is the "single source of truth" the CMS is built around: adding a new
// manageable content type means adding one entry here (plus a Prisma model)
// — the generic admin CRUD API (api/admin/[resource]/*) and the generic admin
// UI (frontend/admin) both read this file, so nothing else needs to change.
// ============================================================================

const COLLECTIONS = {
  'social-links': {
    model: 'socialLink',
    label: 'Social Links',
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'platform', label: 'Platform', type: 'text', required: true },
      { name: 'url', label: 'URL', type: 'url', required: true },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text', placeholder: 'fab fa-github' },
      { name: 'label', label: 'Label', type: 'text' },
    ],
  },
  skills: {
    model: 'skill',
    label: 'Skills',
    orderable: true,
    publishField: 'visible',
    featuredField: 'featured',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'text', required: true, placeholder: 'Programming Languages' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text', placeholder: 'fas fa-code' },
      { name: 'level', label: 'Level (0-100)', type: 'number', min: 0, max: 100 },
    ],
  },
  projects: {
    model: 'project',
    label: 'Projects',
    orderable: true,
    publishField: 'published',
    featuredField: 'featured',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'shortDesc', label: 'Short Description', type: 'textarea' },
      { name: 'fullDesc', label: 'Full Description', type: 'richtext' },
      { name: 'image', label: 'Cover Image', type: 'image' },
      { name: 'images', label: 'Gallery Images', type: 'json-list' },
      { name: 'technologies', label: 'Technologies', type: 'json-tags' },
      { name: 'category', label: 'Category', type: 'text' },
      { name: 'githubUrl', label: 'GitHub URL', type: 'url' },
      { name: 'liveUrl', label: 'Live / Demo URL', type: 'url' },
      { name: 'date', label: 'Date', type: 'text', placeholder: 'e.g. 2025' },
      { name: 'client', label: 'Client / Company', type: 'text' },
      { name: 'role', label: 'Role', type: 'text' },
      { name: 'features', label: 'Key Features', type: 'json-tags' },
    ],
  },
  certificates: {
    model: 'certificate',
    label: 'Certificates',
    orderable: true,
    publishField: 'published',
    featuredField: 'featured',
    fields: [
      { name: 'name', label: 'Certificate Name', type: 'text', required: true },
      { name: 'organization', label: 'Issuing Organization', type: 'text', required: true },
      { name: 'issueDate', label: 'Issue Date', type: 'text', placeholder: 'June 2025' },
      { name: 'expiryDate', label: 'Expiry Date', type: 'text' },
      { name: 'credentialId', label: 'Credential ID', type: 'text' },
      { name: 'credentialUrl', label: 'Credential URL', type: 'url' },
      { name: 'image', label: 'Certificate Image', type: 'image' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'skills', label: 'Related Skills', type: 'json-tags' },
    ],
  },
  experience: {
    model: 'experience',
    label: 'Experience',
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'position', label: 'Position / Title', type: 'text', required: true },
      { name: 'company', label: 'Company', type: 'text', required: true },
      { name: 'startDate', label: 'Start Date', type: 'text' },
      { name: 'endDate', label: 'End Date', type: 'text' },
      { name: 'current', label: 'Current Position', type: 'boolean' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'responsibilities', label: 'Responsibilities', type: 'json-tags' },
      { name: 'technologies', label: 'Technologies', type: 'json-tags' },
      { name: 'logo', label: 'Company Logo', type: 'image' },
      { name: 'location', label: 'Location', type: 'text' },
    ],
  },
  education: {
    model: 'education',
    label: 'Education',
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'degree', label: 'Degree', type: 'text', required: true },
      { name: 'institution', label: 'Institution', type: 'text', required: true },
      { name: 'program', label: 'Program', type: 'text' },
      { name: 'startDate', label: 'Start Date', type: 'text' },
      { name: 'endDate', label: 'End Date', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'grade', label: 'Grade / CGPA', type: 'text' },
      { name: 'logo', label: 'Institution Logo', type: 'image' },
      { name: 'location', label: 'Location', type: 'text' },
    ],
  },
  services: {
    model: 'service',
    label: 'Services',
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'name', label: 'Service Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text' },
      { name: 'image', label: 'Image', type: 'image' },
      { name: 'technologies', label: 'Technologies', type: 'json-tags' },
      { name: 'features', label: 'Features', type: 'json-tags' },
      { name: 'priceLabel', label: 'Price Label', type: 'text', placeholder: 'from $20' },
    ],
  },
  achievements: {
    model: 'achievement',
    label: 'Achievements',
    orderable: true,
    publishField: 'visible',
    featuredField: 'featured',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'date', label: 'Date', type: 'text' },
      { name: 'image', label: 'Image', type: 'image' },
      { name: 'organization', label: 'Organization', type: 'text' },
      { name: 'url', label: 'URL', type: 'url' },
      { name: 'number', label: 'Number (stat)', type: 'number' },
      { name: 'suffix', label: 'Suffix', type: 'text', placeholder: '+' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text' },
    ],
  },
  testimonials: {
    model: 'testimonial',
    label: 'Testimonials',
    orderable: true,
    publishField: 'published',
    fields: [
      { name: 'name', label: 'Person Name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'text' },
      { name: 'company', label: 'Company', type: 'text' },
      { name: 'image', label: 'Photo', type: 'image' },
      { name: 'text', label: 'Testimonial', type: 'textarea', required: true },
      { name: 'rating', label: 'Rating (1-5)', type: 'number', min: 1, max: 5 },
      { name: 'url', label: 'LinkedIn / Website URL', type: 'url' },
    ],
  },
};

const JSON_FIELD_NAMES = new Set([
  'images', 'technologies', 'features', 'responsibilities', 'skills',
  'typedRoles', 'paragraphs', 'tags',
]);

// JSON array fields whose string entries may contain HTML (so they get
// passed through the same sanitizer as richtext fields, rather than being
// trusted as-is).
const HTML_JSON_FIELDS = new Set(['paragraphs']);

const SINGLETONS = {
  profile: {
    model: 'profile',
    label: 'Profile',
    fields: [
      { name: 'fullName', label: 'Full Name', type: 'text', required: true },
      { name: 'displayName', label: 'Display Name / Short Name', type: 'text' },
      { name: 'title', label: 'Professional Title', type: 'text' },
      { name: 'introShort', label: 'Short Introduction', type: 'textarea' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'whatsapp', label: 'WhatsApp Number', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'availability', label: 'Availability', type: 'text', placeholder: 'Open to Work' },
      { name: 'profileImage', label: 'Profile Image', type: 'image' },
      { name: 'resumeUrl', label: 'Resume / CV File', type: 'image' },
    ],
  },
  hero: {
    model: 'hero',
    label: 'Hero Section',
    fields: [
      { name: 'heading', label: 'Main Heading', type: 'text' },
      { name: 'name', label: 'Name (as displayed)', type: 'text' },
      { name: 'typedRoles', label: 'Typed Roles (rotating text)', type: 'json-tags' },
      { name: 'subtitle', label: 'Subtitle', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'ctaText', label: 'Primary Button Text', type: 'text' },
      { name: 'ctaUrl', label: 'Primary Button URL', type: 'text' },
      { name: 'ctaSecondaryText', label: 'Secondary Button Text', type: 'text' },
      { name: 'ctaSecondaryUrl', label: 'Secondary Button URL', type: 'text' },
      { name: 'heroImage', label: 'Hero Image', type: 'image' },
      { name: 'statusText', label: 'Availability / Status Text', type: 'text' },
    ],
  },
  about: {
    model: 'about',
    label: 'About Section',
    fields: [
      { name: 'greeting', label: 'Greeting label', type: 'text', placeholder: 'Who I Am' },
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'subheading', label: 'Subheading', type: 'text' },
      { name: 'paragraphs', label: 'Paragraphs', type: 'json-list' },
      { name: 'tags', label: 'Highlight Tags', type: 'json-tags' },
      { name: 'image', label: 'Image', type: 'image' },
    ],
  },
  contact: {
    model: 'profile',
    label: 'Contact Information',
    fields: [
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'whatsapp', label: 'WhatsApp Number', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'availability', label: 'Availability', type: 'text' },
    ],
  },
  seo: {
    model: 'seoSettings',
    label: 'SEO Settings',
    fields: [
      { name: 'siteTitle', label: 'Website Title', type: 'text' },
      { name: 'metaDescription', label: 'Meta Description', type: 'textarea' },
      { name: 'keywords', label: 'Keywords (comma separated)', type: 'text' },
      { name: 'author', label: 'Author', type: 'text' },
      { name: 'ogTitle', label: 'Open Graph Title', type: 'text' },
      { name: 'ogDescription', label: 'Open Graph Description', type: 'textarea' },
      { name: 'ogImage', label: 'Open Graph Image', type: 'image' },
      { name: 'twitterHandle', label: 'Twitter / X Handle', type: 'text' },
      { name: 'canonicalUrl', label: 'Canonical URL', type: 'url' },
    ],
  },
  'site-settings': {
    model: 'siteSettings',
    label: 'Site Settings',
    fields: [
      { name: 'maintenanceMode', label: 'Maintenance Mode', type: 'boolean' },
      { name: 'footerText', label: 'Footer Text', type: 'text' },
      { name: 'gaId', label: 'Google Analytics ID', type: 'text' },
      { name: 'themeColor', label: 'Theme Color', type: 'text' },
    ],
  },
};

function isJsonField(name) {
  return JSON_FIELD_NAMES.has(name);
}

// Convert a DB row (JSON fields stored as strings) into API/UI shape (real arrays).
function deserializeRow(row, def) {
  if (!row) return row;
  const out = { ...row };
  for (const field of def.fields) {
    if (isJsonField(field.name) && typeof out[field.name] === 'string') {
      try {
        out[field.name] = JSON.parse(out[field.name]);
      } catch {
        out[field.name] = [];
      }
    }
  }
  return out;
}

// Convert API/UI payload (real arrays) into DB shape (JSON strings), keeping
// only known fields so nobody can inject arbitrary columns.
function serializePayload(payload, def) {
  const out = {};
  for (const field of def.fields) {
    if (!(field.name in payload)) continue;
    let value = payload[field.name];
    if (isJsonField(field.name)) {
      if (!Array.isArray(value)) value = [];
      out[field.name] = JSON.stringify(value);
    } else if (field.type === 'number') {
      out[field.name] = value === '' || value === null || value === undefined ? 0 : Number(value);
    } else if (field.type === 'boolean') {
      out[field.name] = !!value;
    } else {
      out[field.name] = value === null || value === undefined ? '' : String(value);
    }
  }
  return out;
}

function validatePayload(payload, def) {
  const errors = [];
  for (const field of def.fields) {
    if (field.required) {
      const value = payload[field.name];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`"${field.label}" is required.`);
      }
    }
    if (field.type === 'url' && payload[field.name]) {
      try {
        // eslint-disable-next-line no-new
        new URL(payload[field.name]);
      } catch {
        errors.push(`"${field.label}" must be a valid URL.`);
      }
    }
    if (field.type === 'email' && payload[field.name]) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload[field.name])) {
        errors.push(`"${field.label}" must be a valid email address.`);
      }
    }
    if (field.type === 'number' && payload[field.name] !== undefined && payload[field.name] !== '') {
      const n = Number(payload[field.name]);
      if (Number.isNaN(n)) errors.push(`"${field.label}" must be a number.`);
      if (field.min !== undefined && n < field.min) errors.push(`"${field.label}" must be >= ${field.min}.`);
      if (field.max !== undefined && n > field.max) errors.push(`"${field.label}" must be <= ${field.max}.`);
    }
  }
  return errors;
}

module.exports = {
  COLLECTIONS,
  SINGLETONS,
  isJsonField,
  HTML_JSON_FIELDS,
  deserializeRow,
  serializePayload,
  validatePayload,
};

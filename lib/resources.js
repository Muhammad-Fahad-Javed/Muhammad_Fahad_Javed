// ============================================================================
// Central resource registry.
//
// This is the "single source of truth" the CMS is built around: adding a new
// manageable content type means adding one entry here (plus a Prisma model)
// — the generic admin CRUD API (api/admin/[resource]/*) and the generic admin
// UI (frontend/admin) both read this file, so nothing else needs to change.
// ============================================================================

const { sanitizeHtml } = require('./sanitize');
const { isSafeLinkUrl, isSafeMediaUrl, isHttpUrl, isRelativePath, describeUnsafeUrl } = require('./urls');

// Collections keep the exact object shape; lookups must go through
// getCollection()/getSingleton() so prototype keys ("__proto__",
// "constructor", …) can never resolve to a registry entry.
const COLLECTIONS = {
  'social-links': {
    model: 'socialLink',
    label: 'Social Links',
    icon: 'fas fa-share-nodes',
    titleField: 'platform',
    imageField: null,
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
    icon: 'fas fa-gauge-high',
    titleField: 'name',
    imageField: null,
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
    icon: 'fas fa-diagram-project',
    titleField: 'title',
    imageField: 'image',
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
    icon: 'fas fa-award',
    titleField: 'name',
    imageField: 'image',
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
    icon: 'fas fa-briefcase',
    titleField: 'position',
    imageField: 'logo',
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
    icon: 'fas fa-graduation-cap',
    titleField: 'degree',
    imageField: 'logo',
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
    icon: 'fas fa-concierge-bell',
    titleField: 'name',
    imageField: 'image',
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
    icon: 'fas fa-trophy',
    titleField: 'title',
    imageField: 'image',
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
    icon: 'fas fa-quote-right',
    titleField: 'name',
    imageField: 'image',
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
  'why-hire': {
    model: 'whyCard',
    label: 'Why Hire Me',
    icon: 'fas fa-star',
    titleField: 'title',
    imageField: null,
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text', placeholder: 'fas fa-puzzle-piece' },
    ],
  },
  'process-steps': {
    model: 'processStep',
    label: 'Process Steps',
    icon: 'fas fa-list-check',
    titleField: 'title',
    imageField: null,
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'title', label: 'Step Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text', placeholder: 'fas fa-magnifying-glass' },
    ],
  },
  faq: {
    model: 'faq',
    label: 'FAQ',
    icon: 'fas fa-circle-question',
    titleField: 'question',
    imageField: null,
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'question', label: 'Question', type: 'text', required: true },
      { name: 'answer', label: 'Answer', type: 'richtext', html: true },
    ],
  },
  journey: {
    model: 'journeyItem',
    label: 'Journey Timeline',
    icon: 'fas fa-timeline',
    titleField: 'title',
    imageField: 'image',
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'year', label: 'Year / Period', type: 'text', placeholder: '2025' },
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'tagList', label: 'Tags', type: 'json-tags' },
      { name: 'image', label: 'Image', type: 'image' },
    ],
  },
  blog: {
    model: 'blogPost',
    label: 'Blog Posts',
    icon: 'fas fa-newspaper',
    titleField: 'title',
    imageField: 'image',
    orderable: true,
    publishField: 'published',
    featuredField: 'featured',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'text', placeholder: 'Development' },
      { name: 'excerpt', label: 'Excerpt / Summary', type: 'textarea' },
      { name: 'body', label: 'Article Body', type: 'richtext', html: true },
      { name: 'image', label: 'Cover Image', type: 'image' },
      { name: 'tagList', label: 'Tags', type: 'json-tags' },
      { name: 'date', label: 'Date', type: 'text', placeholder: 'June 2026' },
      { name: 'readTime', label: 'Read Time', type: 'text', placeholder: '5 min read' },
      { name: 'url', label: 'External URL (optional)', type: 'url' },
    ],
  },
  community: {
    model: 'communityItem',
    label: 'Community',
    icon: 'fas fa-people-group',
    titleField: 'title',
    imageField: 'image',
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text' },
      { name: 'image', label: 'Image', type: 'image' },
      { name: 'stats', label: 'Stats line', type: 'text', placeholder: '12+ videos' },
      { name: 'url', label: 'URL', type: 'url' },
    ],
  },
  'beyond-code': {
    model: 'beyondCard',
    label: 'Beyond Code',
    icon: 'fas fa-heart',
    titleField: 'title',
    imageField: null,
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'tagline', label: 'Highlight line', type: 'text', placeholder: '📚 30+ books' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text' },
    ],
  },
  'coding-profiles': {
    model: 'codingProfile',
    label: 'Coding Profiles',
    icon: 'fas fa-code',
    titleField: 'platform',
    imageField: 'image',
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'platform', label: 'Platform', type: 'text', required: true, placeholder: 'LeetCode' },
      { name: 'title', label: 'Heading', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text' },
      { name: 'image', label: 'Logo / Image', type: 'image' },
      { name: 'url', label: 'Profile URL', type: 'url' },
      { name: 'badge', label: 'Badge text', type: 'text', placeholder: 'Active' },
      { name: 'stats', label: 'Stats line', type: 'text', placeholder: '48 solved · 15-day streak' },
    ],
  },
  clotheric: {
    model: 'clothericCard',
    label: 'Clotheric',
    icon: 'fas fa-shapes',
    titleField: 'title',
    imageField: null,
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon (Font Awesome class)', type: 'text' },
    ],
  },
  'site-text': {
    model: 'siteText',
    label: 'Text & Labels',
    icon: 'fas fa-font',
    titleField: 'label',
    imageField: null,
    orderable: true,
    publishField: 'visible',
    fields: [
      { name: 'label', label: 'What this is (admin description)', type: 'text', required: true },
      { name: 'key', label: 'Key (advanced — used to place the text on the site)', type: 'text', required: true },
      { name: 'value', label: 'Text', type: 'textarea' },
      { name: 'group', label: 'Group', type: 'text', placeholder: 'Navigation' },
    ],
  },
};

const JSON_FIELD_NAMES = new Set([
  'images', 'technologies', 'features', 'responsibilities', 'skills',
  'typedRoles', 'paragraphs', 'tags', 'tagList', 'educationList', 'coreSkills',
]);

// JSON fields whose string entries may contain HTML (so they get passed
// through the same sanitizer as richtext fields, rather than being trusted).
const HTML_JSON_FIELDS = new Set(['paragraphs']);

// Explicit per-field policy for JSON fields. Without this, `String(entry)`
// would destroy structured entries (about.tags is [{icon,label}]) and URL
// lists would be stored unvalidated.
//   media-list  -> array of image URLs
//   html-list   -> array of sanitized HTML strings
//   object-list -> array of { icon, label } objects
//   text-list   -> array of plain strings
const JSON_FIELD_POLICY = {
  images: 'media-list',
  paragraphs: 'html-list',
  tags: 'object-list',
  typedRoles: 'text-list',
  technologies: 'text-list',
  features: 'text-list',
  responsibilities: 'text-list',
  skills: 'text-list',
  tagList: 'text-list',
  educationList: 'text-list',
  coreSkills: 'text-list',
};

const MAX_JSON_ENTRIES = 200;
const MAX_LENGTHS = {
  text: 2000,
  textarea: 20000,
  richtext: 100000,
  url: 2000,
  link: 2000,
  image: 2000,
  color: 32,
  email: 320,
};

// Column names that are always safe to return to the admin UI.
const ALWAYS_ALLOWED_FIELDS = ['id', 'createdAt', 'updatedAt'];

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

// Prototype-safe registry lookups. `COLLECTIONS['__proto__']` is truthy
// (Object.prototype) so a bare property read is NOT a valid check.
function getCollection(name) {
  if (typeof name !== 'string' || !hasOwn(COLLECTIONS, name)) return null;
  const def = COLLECTIONS[name];
  return def && typeof def === 'object' ? def : null;
}

function getSingleton(name) {
  if (typeof name !== 'string' || !hasOwn(SINGLETONS, name)) return null;
  const def = SINGLETONS[name];
  return def && typeof def === 'object' ? def : null;
}

function jsonPolicyFor(name) {
  return JSON_FIELD_POLICY[name] || 'text-list';
}

const SINGLETONS = {
  profile: {
    model: 'profile',
    label: 'Profile',
    icon: 'fas fa-id-badge',
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
    icon: 'fas fa-house',
    fields: [
      { name: 'heading', label: 'Main Heading', type: 'text' },
      { name: 'name', label: 'Name (as displayed)', type: 'text' },
      { name: 'typedRoles', label: 'Typed Roles (rotating text)', type: 'json-tags' },
      { name: 'subtitle', label: 'Subtitle', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'ctaText', label: 'Primary Button Text', type: 'text' },
      { name: 'ctaUrl', label: 'Primary Button URL', type: 'link' },
      { name: 'ctaSecondaryText', label: 'Secondary Button Text', type: 'text' },
      { name: 'ctaSecondaryUrl', label: 'Secondary Button URL', type: 'link' },
      { name: 'heroImage', label: 'Hero Image', type: 'image' },
      { name: 'statusText', label: 'Availability / Status Text', type: 'text', html: true },
    ],
  },
  about: {
    model: 'about',
    label: 'About Section',
    icon: 'fas fa-user',
    fields: [
      { name: 'greeting', label: 'Greeting label', type: 'text', placeholder: 'Who I Am' },
      { name: 'heading', label: 'Heading', type: 'text', html: true },
      { name: 'subheading', label: 'Subheading', type: 'text' },
      { name: 'paragraphs', label: 'Paragraphs', type: 'json-list' },
      { name: 'tags', label: 'Highlight Tags', type: 'json-tags' },
      { name: 'image', label: 'Image', type: 'image' },
    ],
  },
  contact: {
    model: 'profile',
    label: 'Contact Information',
    icon: 'fas fa-envelope',
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
    icon: 'fas fa-magnifying-glass-chart',
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
    label: 'Site & Theme Settings',
    icon: 'fas fa-sliders',
    fields: [
      { name: 'maintenanceMode', label: 'Maintenance Mode', type: 'boolean' },
      { name: 'footerText', label: 'Footer Text / Brand Name', type: 'text' },
      { name: 'gaId', label: 'Google Analytics ID', type: 'text' },
      { name: 'themeColor', label: 'Primary Accent Color', type: 'color', placeholder: '#5A3B22' },
      { name: 'primaryColor', label: 'Primary Brand Color', type: 'color', placeholder: '#4A311D' },
      { name: 'secondaryColor', label: 'Secondary / Hover Color', type: 'color', placeholder: '#4A311D' },
      { name: 'bgColor', label: 'Main Background Color', type: 'color', placeholder: '#F8F5F1' },
      { name: 'surfaceColor', label: 'Card / Surface Background Color', type: 'color', placeholder: '#FBF9F6' },
      { name: 'textColor', label: 'Main Text Color', type: 'color', placeholder: '#2E2118' },
      { name: 'textSecondaryColor', label: 'Secondary / Muted Text Color', type: 'color', placeholder: '#6A5A4C' },
      { name: 'borderColor', label: 'Border Color', type: 'color', placeholder: '#E8E1D8' },
    ],
  },
  linkedin: {
    model: 'linkedInProfile',
    label: 'LinkedIn Card',
    icon: 'fab fa-linkedin',
    fields: [
      { name: 'name', label: 'Name', type: 'text' },
      { name: 'headline', label: 'Headline', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'avatar', label: 'Profile Photo', type: 'image' },
      { name: 'url', label: 'Profile URL', type: 'url' },
      { name: 'connections', label: 'Connections', type: 'text', placeholder: '500+' },
      { name: 'recommendations', label: 'Recommendations', type: 'text', placeholder: '3' },
      { name: 'posts', label: 'Posts', type: 'text', placeholder: '12' },
      { name: 'openToWork', label: 'Show "Open to Work" badge', type: 'boolean' },
    ],
  },
  resume: {
    model: 'resumeSection',
    label: 'Resume Section',
    icon: 'fas fa-file-lines',
    fields: [
      { name: 'intro', label: 'Intro line', type: 'textarea' },
      { name: 'educationList', label: 'Education Highlights', type: 'json-list' },
      { name: 'coreSkills', label: 'Core Skills', type: 'json-tags' },
      { name: 'buttonText', label: 'Button Text', type: 'text', placeholder: 'Download CV' },
      { name: 'buttonUrl', label: 'Button URL', type: 'link' },
    ],
  },
  github: {
    model: 'githubSection',
    label: 'GitHub Section',
    icon: 'fab fa-github',
    fields: [
      { name: 'username', label: 'GitHub Username', type: 'text', placeholder: 'muhammad-fahad-javed' },
      { name: 'profileUrl', label: 'Profile URL', type: 'url' },
      { name: 'bio', label: 'Bio (fallback)', type: 'text' },
      { name: 'location', label: 'Location (fallback)', type: 'text' },
      { name: 'showStats', label: 'Show stats row', type: 'boolean' },
      { name: 'showContributions', label: 'Show contribution graph', type: 'boolean' },
      { name: 'showRepos', label: 'Show repositories', type: 'boolean' },
      { name: 'repoLimit', label: 'Repos before "Show More"', type: 'number', min: 1, max: 30 },
    ],
  },
};

function coerceBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
}

function isJsonField(name) {
  return JSON_FIELD_NAMES.has(name);
}

// Convert a DB row (JSON fields stored as strings) into API/UI shape (real
// arrays), keeping ONLY known columns so a newly added database column can
// never be published automatically.
function pickAllowedFields(row, def) {
  if (!row) return row;
  const out = {};
  for (const key of ALWAYS_ALLOWED_FIELDS) {
    if (hasOwn(row, key)) out[key] = row[key];
  }
  if (hasOwn(row, 'order')) out.order = row.order;
  if (def.publishField && hasOwn(row, def.publishField)) out[def.publishField] = row[def.publishField];
  if (def.featuredField && hasOwn(row, def.featuredField)) out[def.featuredField] = row[def.featuredField];
  for (const field of def.fields) {
    if (hasOwn(row, field.name)) out[field.name] = row[field.name];
  }
  return out;
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deserializeRow(row, def) {
  if (!row) return row;
  const out = pickAllowedFields(row, def);
  for (const field of def.fields) {
    if (isJsonField(field.name) && typeof out[field.name] === 'string') {
      out[field.name] = parseJsonArray(out[field.name]);
    }
  }
  return out;
}

// Default shape for a singleton that does not exist yet, returned WITHOUT
// writing it to the database (GET must not have side effects).
function singletonDefaults(def) {
  const out = { id: 'singleton' };
  for (const field of def.fields) {
    if (isJsonField(field.name)) out[field.name] = [];
    else if (field.type === 'boolean') out[field.name] = false;
    else if (field.type === 'number') out[field.name] = 0;
    else out[field.name] = '';
  }
  return out;
}

function deserializeSingleton(row, def) {
  if (!row) return singletonDefaults(def);
  return deserializeRow(row, def);
}

// Normalises a JSON field value according to its declared policy. String
// entries of HTML-bearing fields are sanitised here, which means bulk import
// gets the same protection as individual writes.
function normalizeJsonList(name, list) {
  const policy = jsonPolicyFor(name);
  const entries = Array.isArray(list) ? list : [];

  if (policy === 'html-list') {
    return entries.map((entry) => sanitizeHtml(entry == null ? '' : String(entry)));
  }
  if (policy === 'object-list') {
    return entries.map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return {
          icon: sanitizeHtml(String(entry.icon == null ? '' : entry.icon)),
          label: sanitizeHtml(String(entry.label == null ? '' : entry.label)),
        };
      }
      return { icon: '', label: sanitizeHtml(entry == null ? '' : String(entry)) };
    });
  }
  // media-list / text-list -> plain strings.
  return entries.map((entry) => (entry == null ? '' : String(entry)));
}

// Builds the database payload for a write: only known fields are kept, and
// sanitisation/coercion is applied for every field type. Every write path
// (collection create/update, singleton update, bulk import) uses this, so
// sanitisation cannot be skipped by any individual route.
function buildWriteData(payload, def) {
  const out = {};
  for (const field of def.fields) {
    if (!hasOwn(payload, field.name)) continue;
    const value = payload[field.name];

    if (isJsonField(field.name)) {
      out[field.name] = JSON.stringify(normalizeJsonList(field.name, value));
      continue;
    }
    if (field.type === 'number') {
      if (value === '' || value === null || value === undefined) {
        out[field.name] = 0;
      } else {
        const n = Number(value);
        out[field.name] = Number.isFinite(n) ? Math.trunc(n) : 0;
      }
      continue;
    }
    if (field.type === 'boolean') {
      out[field.name] = coerceBoolean(value, false);
      continue;
    }
    // `html: true` marks plain-text fields that the public client deliberately
    // injects with innerHTML (hero.statusText, about.heading). They must be
    // sanitised exactly like richtext fields, otherwise an author could store
    // markup that executes on the public site.
    if (field.type === 'richtext' || field.html === true) {
      out[field.name] = sanitizeHtml(value == null ? '' : String(value));
      continue;
    }
    out[field.name] = value === null || value === undefined ? '' : String(value);
  }
  return out;
}

// Applies the meta-columns that are not part of `def.fields` (publish/featured
// flags and manual order) to a write payload.
function applyMetaFields(body, def, data) {
  if (def.publishField && hasOwn(body, def.publishField)) {
    data[def.publishField] = coerceBoolean(body[def.publishField], false);
  }
  if (def.featuredField && hasOwn(body, def.featuredField)) {
    data[def.featuredField] = coerceBoolean(body[def.featuredField], false);
  }
  if (hasOwn(body, 'order') && Number.isFinite(Number(body.order))) {
    data.order = Math.trunc(Number(body.order));
  }
  return data;
}

function validatePayload(payload, def, options) {
  const opts = options || {};
  const partial = !!opts.partial;
  const errors = [];

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['Request body must be a JSON object.'];
  }

  for (const field of def.fields) {
    const provided = hasOwn(payload, field.name);
    const value = payload[field.name];
    const label = `"${field.label}"`;

    if (field.required && !partial) {
      if (!provided || value === undefined || value === null || String(value).trim() === '') {
        errors.push(`${label} is required.`);
        continue;
      }
    }

    if (!provided || value === undefined || value === null || value === '') continue;

    if (isJsonField(field.name)) {
      if (!Array.isArray(value)) {
        errors.push(`${label} must be a list.`);
        continue;
      }
      if (value.length > MAX_JSON_ENTRIES) {
        errors.push(`${label} has too many entries (max ${MAX_JSON_ENTRIES}).`);
        continue;
      }
      if (jsonPolicyFor(field.name) === 'media-list') {
        for (const entry of value) {
          const url = String(entry == null ? '' : entry).trim();
          if (url && !isSafeMediaUrl(url)) {
            errors.push(`${label} contains an invalid image URL (${describeUnsafeUrl()}).`);
            break;
          }
        }
      }
      continue;
    }

    switch (field.type) {
      case 'url': {
        const v = String(value).trim();
        if (!isHttpUrl(v) && !isRelativePath(v)) errors.push(`${label} ${describeUnsafeUrl()}`);
        else if (v.length > MAX_LENGTHS.url) errors.push(`${label} is too long.`);
        break;
      }
      case 'link': {
        const v = String(value).trim();
        if (!isSafeLinkUrl(v)) {
          errors.push(`${label} must be an http(s), mailto:, tel:, "#anchor" or site-relative link.`);
        } else if (v.length > MAX_LENGTHS.link) errors.push(`${label} is too long.`);
        break;
      }
      case 'image': {
        const v = String(value).trim();
        if (!isSafeMediaUrl(v)) errors.push(`${label} must be an http(s) URL or site-relative path.`);
        break;
      }
      case 'email': {
        const v = String(value).trim();
        if (v.length > MAX_LENGTHS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          errors.push(`${label} must be a valid email address.`);
        }
        break;
      }
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) errors.push(`${label} must be a number.`);
        else {
          if (field.min !== undefined && n < field.min) errors.push(`${label} must be >= ${field.min}.`);
          if (field.max !== undefined && n > field.max) errors.push(`${label} must be <= ${field.max}.`);
        }
        break;
      }
      default: {
        const max = MAX_LENGTHS[field.type] || MAX_LENGTHS.text;
        if (String(value).length > max) errors.push(`${label} is too long (max ${max} characters).`);
      }
    }
  }

  return errors;
}

module.exports = {
  COLLECTIONS,
  SINGLETONS,
  isJsonField,
  HTML_JSON_FIELDS,
  JSON_FIELD_POLICY,
  jsonPolicyFor,
  coerceBoolean,
  hasOwn,
  getCollection,
  getSingleton,
  pickAllowedFields,
  deserializeRow,
  deserializeSingleton,
  singletonDefaults,
  normalizeJsonList,
  buildWriteData,
  // Backwards-compatible alias used by existing routes.
  serializePayload: buildWriteData,
  applyMetaFields,
  validatePayload,
  MAX_JSON_ENTRIES,
  MAX_LENGTHS,
};

#!/usr/bin/env node
// ============================================================================
// Generates frontend/admin/js/resources.js FROM lib/resources.js.
//
// The admin UI is a plain browser script (no bundler), so it cannot `require`
// the server registry directly. Instead of maintaining two hand-written copies
// that silently drift apart, the client file is generated from the one true
// source and verified in CI/test.
//
// Usage:
//   node scripts/generate-client-registry.js          # write the file
//   node scripts/generate-client-registry.js --check  # exit 1 if out of date
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { COLLECTIONS, SINGLETONS, jsonPolicyFor } = require('../lib/resources');

const OUT_PATH = path.join(__dirname, '..', 'frontend', 'admin', 'js', 'resources.js');

// `about.tags` stores { icon, label } objects and is rendered by a dedicated
// control; every other JSON field is a list of strings.
function clientFieldType(field) {
  if (jsonPolicyFor(field.name) === 'object-list') return 'json-tags-obj';
  return field.type;
}

function serializeField(field, indent) {
  const pad = ' '.repeat(indent);
  const parts = [
    `name: ${JSON.stringify(field.name)}`,
    `label: ${JSON.stringify(field.label)}`,
    `type: ${JSON.stringify(clientFieldType(field))}`,
  ];
  if (field.required) parts.push('required: true');
  if (field.placeholder) parts.push(`placeholder: ${JSON.stringify(field.placeholder)}`);
  if (field.hint) parts.push(`hint: ${JSON.stringify(field.hint)}`);
  if (field.min !== undefined) parts.push(`min: ${field.min}`);
  if (field.max !== undefined) parts.push(`max: ${field.max}`);
  return `${pad}{ ${parts.join(', ')} },`;
}

function buildCollections() {
  const lines = ['window.CMS_COLLECTIONS = {'];
  for (const [key, def] of Object.entries(COLLECTIONS)) {
    lines.push(`  ${JSON.stringify(key)}: {`);
    lines.push(`    label: ${JSON.stringify(def.label)}, icon: ${JSON.stringify(def.icon || '')},`);
    lines.push(
      `    titleField: ${JSON.stringify(def.titleField || 'id')}, `
      + `imageField: ${def.imageField ? JSON.stringify(def.imageField) : 'null'}, `
      + `publishField: ${def.publishField ? JSON.stringify(def.publishField) : 'null'}, `
      + `featuredField: ${def.featuredField ? JSON.stringify(def.featuredField) : 'null'},`
    );
    lines.push('    fields: [');
    for (const field of def.fields) lines.push(serializeField(field, 6));
    lines.push('    ],');
    lines.push('  },');
  }
  lines.push('};');
  return lines.join('\n');
}

function buildSingletons() {
  const lines = ['window.CMS_SINGLETONS = {'];
  for (const [key, def] of Object.entries(SINGLETONS)) {
    lines.push(`  ${JSON.stringify(key)}: {`);
    lines.push(`    label: ${JSON.stringify(def.label)}, icon: ${JSON.stringify(def.icon || '')},`);
    lines.push('    fields: [');
    for (const field of def.fields) lines.push(serializeField(field, 6));
    lines.push('    ],');
    lines.push('  },');
  }
  lines.push('};');
  return lines.join('\n');
}

function buildFile() {
  const header = [
    '// ============================================================================',
    '// GENERATED FILE - DO NOT EDIT BY HAND.',
    '//',
    '// Produced by:  node scripts/generate-client-registry.js',
    '// Source of truth:  lib/resources.js',
    '//',
    '// Run the generator after changing the server registry; the test suite',
    '// fails if this file is out of date.',
    '// ============================================================================',
  ].join('\n');
  return `${header}\n\n${buildCollections()}\n\n${buildSingletons()}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const content = buildFile();

  if (check) {
    const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    const normalized = (s) => s.replace(/\r\n/g, '\n');
    if (normalized(current) !== normalized(content)) {
      console.error('frontend/admin/js/resources.js is out of date. Run: node scripts/generate-client-registry.js');
      process.exit(1);
    }
    console.log('Client resource registry is in sync with lib/resources.js.');
    return;
  }

  fs.writeFileSync(OUT_PATH, content, 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();

// ============================================================================
// Media reference tracking.
//
// Uploaded files may be shared: the same URL can appear as a project cover,
// inside a gallery, and on a certificate. Before deleting an upload we must
// confirm no other record still points at it, otherwise deleting one item
// silently breaks images elsewhere.
// ============================================================================
'use strict';

const { COLLECTIONS, SINGLETONS, isJsonField, jsonPolicyFor } = require('./resources');
const { deleteFile, isManagedUrl } = require('./storage');

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Extracts every media URL referenced by a single row, according to its
// registry definition (image fields + media-list JSON fields such as
// project.images).
function collectRowMediaUrls(row, def, into) {
  const out = into || new Set();
  if (!row) return out;
  for (const field of def.fields) {
    const value = row[field.name];
    if (value === null || value === undefined) continue;

    if (field.type === 'image') {
      if (typeof value === 'string' && value.trim()) out.add(value.trim());
      continue;
    }
    if (isJsonField(field.name) && jsonPolicyFor(field.name) === 'media-list') {
      for (const entry of parseList(value)) {
        if (typeof entry === 'string' && entry.trim()) out.add(entry.trim());
      }
    }
  }
  return out;
}

// Every media URL currently referenced by any content row (collections and
// singleton settings). The Media library table itself is intentionally NOT
// included: it is the list of files, not a reference to them.
async function collectReferencedUrls(prisma) {
  const urls = new Set();

  const byModel = new Map();
  for (const def of Object.values(COLLECTIONS)) {
    if (!byModel.has(def.model)) byModel.set(def.model, []);
    byModel.get(def.model).push(def);
  }
  for (const [model, defs] of byModel) {
    let rows = [];
    try {
      rows = await prisma[model].findMany();
    } catch {
      rows = [];
    }
    for (const row of rows) {
      for (const def of defs) collectRowMediaUrls(row, def, urls);
    }
  }

  const singletonByModel = new Map();
  for (const def of Object.values(SINGLETONS)) {
    if (!singletonByModel.has(def.model)) singletonByModel.set(def.model, []);
    singletonByModel.get(def.model).push(def);
  }
  for (const [model, defs] of singletonByModel) {
    let row = null;
    try {
      row = await prisma[model].findUnique({ where: { id: 'singleton' } });
    } catch {
      row = null;
    }
    if (row) {
      for (const def of defs) collectRowMediaUrls(row, def, urls);
    }
  }

  return urls;
}

// Deletes a managed upload only when nothing else references it.
async function deleteManagedFileIfUnreferenced(url, prisma) {
  if (!isManagedUrl(url)) return { deleted: false, reason: 'unmanaged' };
  try {
    const referenced = await collectReferencedUrls(prisma);
    if (referenced.has(url)) return { deleted: false, reason: 'referenced' };
    await deleteFile(url);
    return { deleted: true };
  } catch (err) {
    console.error('[media] cleanup failed:', err && err.message);
    return { deleted: false, reason: 'error' };
  }
}

module.exports = {
  collectRowMediaUrls,
  collectReferencedUrls,
  deleteManagedFileIfUnreferenced,
};

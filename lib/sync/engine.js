// ============================================================================
// The sync engine: turns a provider's field updates into safe database writes.
//
// This is the only place that writes synced data, and it enforces the rules
// that make automatic updates safe on a hand-edited portfolio:
//
//   1. Nothing is written unless the provider call already succeeded in full.
//   2. A null / empty / whitespace value NEVER overwrites real content.
//      (The GitHub account behind this portfolio returns null for bio and
//      location, so an unconditional write would silently erase them.)
//   3. A field can be locked: manual override always beats automation.
//   4. `fill-only` fields are only written while empty, so a description you
//      wrote by hand is never replaced by a one-line repo blurb.
//   5. Identical values are skipped, so repeated syncs are no-ops.
//   6. All writes for a run happen in one transaction: a failure applies
//      nothing rather than leaving the profile half updated.
//   7. Every attempt is recorded in SyncRun, including failures, with no
//      tokens and no payload values.
// ============================================================================
'use strict';

const crypto = require('crypto');

// Registry entity -> Prisma model.
const ENTITY_MODELS = {
  profile: 'profile',
  hero: 'hero',
  about: 'about',
  github: 'githubSection',
  linkedin: 'linkedInProfile',
  project: 'project',
};

// Entities stored as a single row with a fixed id.
const SINGLETON_ENTITIES = new Set(['profile', 'hero', 'about', 'github', 'linkedin']);

// Fields stored as a JSON-encoded array in a String column.
const JSON_FIELDS = {
  project: new Set(['technologies', 'images', 'features']),
  about: new Set(['paragraphs', 'tags']),
};

const POLICIES = new Set(['overwrite', 'fill-only']);

const MESSAGE_LIMIT = 300;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function jsonFieldsFor(entity) {
  return hasOwn(JSON_FIELDS, entity) ? JSON_FIELDS[entity] : null;
}

function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Stable string form so "same value" comparisons and hashes are predictable.
function canonical(value) {
  if (Array.isArray(value)) return 'array:' + JSON.stringify(value);
  if (value instanceof Date) return 'date:' + value.toISOString();
  if (value === null || value === undefined) return 'null';
  return typeof value + ':' + String(value);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex').slice(0, 32);
}

// Reads a stored column value back into the shape the provider speaks.
function parseStored(entity, field, raw) {
  const fields = jsonFieldsFor(entity);
  if (!fields || !fields.has(field)) return raw;
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Serialises a value for the column it is stored in.
function toStored(entity, field, value) {
  const fields = jsonFieldsFor(entity);
  if (!fields || !fields.has(field)) return value;
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function equalValues(entity, field, current, next) {
  return canonical(parseStored(entity, field, current)) === canonical(next);
}

// Removes anything that looks like a credential before a message is persisted.
function scrub(text) {
  let out = String(text === undefined || text === null ? '' : text);
  out = out
    .replace(/github_pat_[A-Za-z0-9_]{10,}/g, '[redacted]')
    .replace(/gh[pousr]_[A-Za-z0-9]{10,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{10,}=*/gi, 'Bearer [redacted]')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]');
  return out.slice(0, MESSAGE_LIMIT);
}

function rowId(entity, entityId) {
  return SINGLETON_ENTITIES.has(entity) ? 'singleton' : entityId;
}

// Pure decision function: keeps the policy visible and the side effects out.
function decideUpdate(update, currentValue, state) {
  if (!POLICIES.has(update.policy)) return 'invalid-policy';
  if (state && state.locked) return 'locked';
  if (isEmptyValue(update.value)) return 'empty';
  if (update.policy === 'fill-only' && !isEmptyValue(currentValue)) return 'kept';
  if (equalValues(update.entity, update.field, currentValue, update.value)) return 'unchanged';
  return 'write';
}

function summarise(counts) {
  const parts = [];
  if (counts.write) parts.push(counts.write + ' updated');
  if (counts.unchanged) parts.push(counts.unchanged + ' unchanged');
  if (counts.kept) parts.push(counts.kept + ' kept');
  if (counts.locked) parts.push(counts.locked + ' locked');
  if (counts.empty) parts.push(counts.empty + ' empty at source');
  if (counts.missing) parts.push(counts.missing + ' row missing');
  if (counts['invalid-policy']) parts.push(counts['invalid-policy'] + ' ignored');
  return parts.length ? parts.join(', ') : 'nothing to sync';
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function loadStates(tx, updates) {
  const wanted = new Map();
  for (const update of updates) {
    const key = update.entity + '\u0000' + (update.entityId || '');
    if (!wanted.has(key)) wanted.set(key, { entity: update.entity, entityId: update.entityId || '' });
  }

  const states = new Map();
  for (const scope of wanted.values()) {
    const rows = await tx.fieldState.findMany({
      where: { entity: scope.entity, entityId: scope.entityId },
    });
    for (const row of rows) {
      states.set(scope.entity + '\u0000' + scope.entityId + '\u0000' + row.field, row);
    }
  }
  return states;
}

async function saveState(tx, update, value, provider, at) {
  const entityId = update.entityId || '';
  const existing = await tx.fieldState.findFirst({
    where: { entity: update.entity, entityId, field: update.field },
  });

  const data = {
    source: provider,
    syncedAt: at,
    status: 'ok',
    valueHash: hashValue(value),
  };

  if (existing) {
    await tx.fieldState.update({ where: { id: existing.id }, data });
    return;
  }

  await tx.fieldState.create({
    data: {
      entity: update.entity,
      entityId,
      field: update.field,
      locked: false,
      visible: true,
      ...data,
    },
  });
}

/**
 * Applies a provider's field updates.
 *
 * @param {object}   options
 * @param {object}   options.prisma   Prisma client (or the test fake)
 * @param {string}   options.provider 'github' | 'linkedin'
 * @param {string}   options.trigger  'manual' | 'cron' | 'connect'
 * @param {Array}    options.updates  [{ entity, entityId, field, value, policy }]
 * @param {Function} [options.clock]  () => Date, injectable for tests
 */
async function applySync(options) {
  const opts = options || {};
  const prisma = opts.prisma;
  const provider = String(opts.provider || '').trim();
  const trigger = String(opts.trigger || 'manual').trim();
  const updates = Array.isArray(opts.updates) ? opts.updates : [];
  const clock = opts.clock || (() => new Date());

  if (!prisma) throw new Error('applySync requires a prisma client.');
  if (!provider) throw new Error('applySync requires a provider.');

  const startedAt = clock();
  const run = await prisma.syncRun.create({
    data: {
      provider,
      trigger,
      status: 'running',
      startedAt,
      finishedAt: null,
      fieldsChanged: 0,
      fieldsSkipped: 0,
      message: '',
    },
  });

  const counts = {
    write: 0,
    unchanged: 0,
    kept: 0,
    locked: 0,
    empty: 0,
    missing: 0,
    'invalid-policy': 0,
  };

  try {
    const applied = await prisma.$transaction(async (tx) => {
      const states = await loadStates(tx, updates);
      const rows = new Map();
      const writes = new Map();

      for (const update of updates) {
        const entity = update.entity;
        if (!hasOwn(ENTITY_MODELS, entity)) {
          counts['invalid-policy'] += 1;
          continue;
        }

        const id = rowId(entity, update.entityId);
        const rowKey = entity + '\u0000' + id;

        if (!rows.has(rowKey)) {
          const row = await tx[ENTITY_MODELS[entity]].findUnique({ where: { id } });
          rows.set(rowKey, row || null);
        }

        const row = rows.get(rowKey);
        if (!row) {
          counts.missing += 1;
          continue;
        }

        const stateKey =
          entity + '\u0000' + (update.entityId || '') + '\u0000' + update.field;
        const state = states.get(stateKey) || null;

        const current = parseStored(entity, update.field, row[update.field]);
        const verdict = decideUpdate(update, current, state);
        counts[verdict] += 1;

        if (verdict !== 'write') continue;

        const pending = writes.get(rowKey) || {
          entity,
          id,
          model: ENTITY_MODELS[entity],
          data: {},
          fields: [],
        };
        pending.data[update.field] = toStored(entity, update.field, update.value);
        pending.fields.push({ update, value: update.value });
        writes.set(rowKey, pending);
      }

      // One write per row, then one FieldState per field.
      for (const pending of writes.values()) {
        await tx[pending.model].update({ where: { id: pending.id }, data: pending.data });
        for (const entry of pending.fields) {
          await saveState(tx, entry.update, entry.value, provider, clock());
        }
      }

      return { rowsWritten: writes.size };
    }, { timeout: 15000 });

    const finishedAt = clock();
    const message = summarise(counts);

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        finishedAt,
        fieldsChanged: counts.write,
        fieldsSkipped:
          counts.unchanged + counts.kept + counts.locked + counts.empty + counts.missing,
        message,
      },
    });

    return {
      runId: run.id,
      status: 'success',
      changed: counts.write,
      skipped: counts.unchanged + counts.kept + counts.locked + counts.empty,
      counts,
      message,
      rowsWritten: applied.rowsWritten,
    };
  } catch (err) {
    const message = scrub(err && err.message ? err.message : 'Sync failed.');
    try {
      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'error',
          finishedAt: clock(),
          // The transaction rolled back, so nothing was applied; record the
          // counts that were reached for diagnostics without claiming success.
          fieldsChanged: 0,
          fieldsSkipped: 0,
          message,
        },
      });
    } catch {
      // Recording the failure must never mask the original error.
    }
    throw err;
  }
}

module.exports = {
  applySync,
  decideUpdate,
  summarise,
  scrub,
  hashValue,
  canonical,
  isEmptyValue,
  parseStored,
  toStored,
  ENTITY_MODELS,
  SINGLETON_ENTITIES,
};

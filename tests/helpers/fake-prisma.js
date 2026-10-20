// ============================================================================
// In-memory Prisma stand-in for tests.
//
// The production database is a live Neon instance and the mission forbids
// running destructive tests against it, so the API handlers are exercised
// against a fake client with real filtering / ordering / transaction
// semantics (including rollback).
// ============================================================================
'use strict';

const MODELS = [
  'adminUser', 'session', 'loginAttempt', 'auditLog', 'media',
  'profile', 'hero', 'about', 'seoSettings', 'siteSettings',
  'socialLink', 'skill', 'project', 'certificate', 'experience',
  'education', 'service', 'achievement', 'testimonial',
  'whyCard', 'processStep', 'faq', 'journeyItem', 'blogPost',
  'communityItem', 'beyondCard', 'codingProfile', 'clothericCard',
  'siteText', 'linkedInProfile', 'resumeSection', 'githubSection',
  'sectionToggle', 'integration', 'fieldState', 'syncRun',
];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function matchValue(value, cond) {
  if (isPlainObject(cond)) {
    if ('in' in cond) return cond.in.includes(value);
    if ('notIn' in cond) return !cond.notIn.includes(value);
    if ('gte' in cond) return value >= cond.gte;
    if ('lte' in cond) return value <= cond.lte;
    if ('gt' in cond) return value > cond.gt;
    if ('lt' in cond) return value < cond.lt;
    if ('not' in cond) return value !== cond.not;
    if ('equals' in cond) return value === cond.equals;
    return false;
  }
  return value === cond;
}

function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return cond.some((entry) => matches(row, entry));
    if (key === 'AND') return cond.every((entry) => matches(row, entry));
    if (key === 'NOT') return !matches(row, cond);
    return matchValue(row[key], cond);
  });
}

function applyOrder(rows, orderBy) {
  if (!orderBy) return rows;
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  return rows.slice().sort((a, b) => {
    for (const clause of list) {
      const [field, dir] = Object.entries(clause)[0];
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value)) {
      if ('increment' in value) { row[key] = (row[key] || 0) + value.increment; continue; }
      if ('decrement' in value) { row[key] = (row[key] || 0) - value.decrement; continue; }
      if ('set' in value) { row[key] = value.set; continue; }
    }
    row[key] = value;
  }
}

function notFoundError() {
  const err = new Error('Record not found');
  err.code = 'P2025';
  return err;
}

function createFakePrisma(seedData) {
  const stores = new Map();
  for (const name of MODELS) stores.set(name, new Map());
  let idCounter = 0;
  // Monotonic clock so successive writes always get a distinct updatedAt
  // (needed to exercise optimistic concurrency control).
  let clock = Date.now();
  const nextDate = () => new Date(clock++);

  if (seedData) {
    for (const [model, rows] of Object.entries(seedData)) {
      const store = stores.get(model);
      if (!store) throw new Error(`Unknown model in seed: ${model}`);
      for (const row of rows) store.set(row.id, { ...row });
    }
  }

  function client() {
    const api = {
      $transaction: async (arg) => {
        const snapshot = new Map();
        for (const [name, store] of stores) snapshot.set(name, structuredClone([...store.entries()]));
        const restore = () => {
          // Mutate the existing Map objects in place: the per-model closures
          // captured these exact Map instances.
          for (const [name, entries] of snapshot) {
            const store = stores.get(name);
            store.clear();
            for (const [key, value] of entries) store.set(key, value);
          }
        };
        try {
          if (typeof arg === 'function') return await arg(api);
          return await Promise.all(arg);
        } catch (err) {
          restore();
          throw err;
        }
      },
    };

    for (const name of MODELS) {
      const store = stores.get(name);

      const model = {
        async findMany(args = {}) {
          let rows = [...store.values()];
          if (args.where) rows = rows.filter((row) => matches(row, args.where));
          rows = applyOrder(rows, args.orderBy);
          if (args.skip) rows = rows.slice(args.skip);
          if (args.take !== undefined) rows = rows.slice(0, args.take);
          return rows.map((row) => ({ ...row }));
        },
        async findUnique(args = {}) {
          const where = args.where || {};
          if (where.id !== undefined) {
            const row = store.get(where.id);
            return row ? { ...row } : null;
          }
          const found = [...store.values()].find((row) => matches(row, where));
          return found ? { ...found } : null;
        },
        async findFirst(args = {}) {
          const rows = await model.findMany({ ...args, take: 1 });
          return rows[0] || null;
        },
        async count(args = {}) {
          let rows = [...store.values()];
          if (args.where) rows = rows.filter((row) => matches(row, args.where));
          return rows.length;
        },
        async create(args = {}) {
          const data = args.data || {};
          idCounter += 1;
          const id = data.id || `${name}_${idCounter}`;
          if (store.has(id)) {
            const err = new Error(`Unique constraint failed on ${name}.id`);
            err.code = 'P2002';
            throw err;
          }
          const row = { ...data, id };
          if (row.createdAt === undefined) row.createdAt = nextDate();
          if (row.updatedAt === undefined) row.updatedAt = nextDate();
          store.set(id, row);
          return { ...row };
        },
        async update(args = {}) {
          const row = store.get(args.where && args.where.id);
          if (!row) throw notFoundError();
          applyData(row, args.data || {});
          row.updatedAt = nextDate();
          return { ...row };
        },
        async updateMany(args = {}) {
          let count = 0;
          for (const row of store.values()) {
            if (matches(row, args.where)) {
              applyData(row, args.data || {});
              count += 1;
            }
          }
          return { count };
        },
        async delete(args = {}) {
          const id = args.where && args.where.id;
          const row = store.get(id);
          if (!row) throw notFoundError();
          store.delete(id);
          return { ...row };
        },
        async deleteMany(args = {}) {
          let count = 0;
          for (const [id, row] of [...store.entries()]) {
            if (matches(row, args.where)) {
              store.delete(id);
              count += 1;
            }
          }
          return { count };
        },
        async upsert(args = {}) {
          const id = args.where && args.where.id;
          const existing = id !== undefined ? store.get(id) : undefined;
          if (existing) {
            applyData(existing, args.update || {});
            existing.updatedAt = nextDate();
            return { ...existing };
          }
          return model.create({ data: args.create || {} });
        },
      };

      api[name] = model;
    }

    return api;
  }

  const root = client();
  // Expose the raw stores for assertions.
  Object.defineProperty(root, '__stores', { value: stores, enumerable: false });
  return root;
}

module.exports = { createFakePrisma, MODELS };

// ============================================================================
// Derives a LOCAL-ONLY Prisma schema from prisma/schema.prisma.
//
// Two changes are made, and nothing else:
//
//   1. the datasource is switched to SQLite and pointed at
//      env("LOCAL_DATABASE_URL") — deliberately NOT DATABASE_URL, so the local
//      client can never fall back to the production Postgres instance;
//   2. the generated client is written into .local-dev/client instead of
//      node_modules/.prisma, which would overwrite the Postgres client the
//      deployed application needs.
//
// Every model/field survives unchanged, so the local database has the same
// shape as production.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, SCHEMA_FILE, CLIENT_DIR } = require('./paths');

const SOURCE_SCHEMA = path.join(REPO_ROOT, 'prisma', 'schema.prisma');

function buildLocalSchema(source, clientDir) {
  const client = clientDir.split(path.sep).join('/');

  const out = source
    .replace(
      /datasource db \{[\s\S]*?\n\}/,
      'datasource db {\n  provider = "sqlite"\n  url      = env("LOCAL_DATABASE_URL")\n}'
    )
    .replace(
      /generator client \{[\s\S]*?\n\}/,
      `generator client {\n  provider = "prisma-client-js"\n  output   = "${client}"\n}`
    );

  // Fail loudly rather than silently producing a schema that points somewhere
  // unexpected.
  if (!out.includes('provider = "sqlite"')) throw new Error('datasource rewrite failed');
  if (!out.includes('env("LOCAL_DATABASE_URL")')) throw new Error('local datasource URL rewrite failed');
  if (!out.includes(client)) throw new Error('generator rewrite failed');
  if (/postgresql/.test(out)) throw new Error('local schema still references postgresql');

  return out;
}

function generate() {
  const source = fs.readFileSync(SOURCE_SCHEMA, 'utf8');
  const out = buildLocalSchema(source, CLIENT_DIR);

  fs.mkdirSync(path.dirname(SCHEMA_FILE), { recursive: true });
  fs.writeFileSync(SCHEMA_FILE, out, 'utf8');

  return { schema: SCHEMA_FILE, models: (out.match(/^model /gm) || []).length };
}

module.exports = { buildLocalSchema, generate, SOURCE_SCHEMA };

if (require.main === module) {
  const { schema, models } = generate();
  console.log('Wrote local schema: ' + schema);
  console.log('Models: ' + models);
}

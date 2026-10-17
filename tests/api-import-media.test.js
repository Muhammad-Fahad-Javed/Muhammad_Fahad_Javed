// ============================================================================
// Stage 2/3 — media uploads and bulk import.
// Covers A10, B2, B4, B9, C2 (media) and transactional import behaviour.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFakePrisma } = require('./helpers/fake-prisma');
const { loadModule, mockReq, callHandler, cookieFrom, ROOT } = require('./helpers/harness');

const ADMIN_EMAIL = 'admin@portfolio.test';
const ADMIN_PASSWORD = 'password-1234';
const MEDIA = 'api/admin/media/index.js';
const IMPORT = 'api/admin/import.js';
const UPLOAD_DIR = path.join(ROOT, 'frontend', 'uploads');

async function bootstrap() {
  const prisma = createFakePrisma();
  const { hashPassword } = loadModule('lib/auth.js', prisma);
  await prisma.adminUser.create({
    data: { email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD), name: 'Admin', sessionVersion: 1 },
  });
  const auth = loadModule('api/auth/[...route].js', prisma);
  const res = await callHandler(
    auth,
    mockReq({ method: 'POST', url: '/api/auth/login', query: { route: 'login' }, body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  );
  assert.equal(res.statusCode, 200);
  return { prisma, cookie: cookieFrom(res) };
}

async function call(relative, prisma, options) {
  const handler = loadModule(relative, prisma);
  return callHandler(handler, mockReq(options));
}

// --- Fixtures -------------------------------------------------------------

// A structurally valid (CRC-ignored) PNG header with known dimensions.
function makePng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const type = Buffer.from('IHDR', 'ascii');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([signature, length, type, ihdr, Buffer.alloc(4)]);
}

function makePdf() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'ascii');
}

function uploadBody(filename, contentType, buffer) {
  return { filename, contentType, dataBase64: buffer.toString('base64') };
}

function localPathFor(url) {
  if (!url.startsWith('/uploads/')) return null;
  return path.join(UPLOAD_DIR, url.slice('/uploads/'.length));
}

function cleanup(url) {
  const filePath = localPathFor(url);
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ---------------------------------------------------------------------------
// A10 — upload validation
// ---------------------------------------------------------------------------

test('A10: SVG uploads are rejected', async () => {
  const { prisma, cookie } = await bootstrap();
  const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    body: uploadBody('evil.svg', 'image/svg+xml', Buffer.from(svg)),
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /SVG/i);
  assert.equal(await prisma.media.count(), 0);
});

test('A10: an executable disguised as an image is rejected by content sniffing', async () => {
  const { prisma, cookie } = await bootstrap();
  const html = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>', 'utf8');
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    body: uploadBody('innocent.png', 'image/png', html),
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /contents/i);
  assert.equal(await prisma.media.count(), 0);
});

test('A10: content that disagrees with the declared type is rejected', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    body: uploadBody('report.pdf', 'application/pdf', makePng(4, 4)),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(await prisma.media.count(), 0);
});

test('A10: the declared type alone is not trusted (no sniff match => reject)', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    body: uploadBody('x.gif', 'image/gif', Buffer.from('not really a gif at all', 'utf8')),
  });
  assert.equal(res.statusCode, 400);
});

test('A10/C5: a real PNG is accepted and its dimensions are recorded', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    body: uploadBody('photo.png', 'image/png', makePng(3, 2)),
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.width, 3);
  assert.equal(res.body.height, 2);
  assert.equal(res.body.type, 'image/png');
  assert.match(res.body.url, /^\/uploads\/\d+-[0-9a-f]+\.png$/);
  cleanup(res.body.url);
});

test('A10: a PDF is accepted and stored with a pdf extension', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    body: uploadBody('cv.pdf', 'application/pdf', makePdf()),
  });
  assert.equal(res.statusCode, 201);
  assert.match(res.body.url, /\.pdf$/);
  cleanup(res.body.url);
});

test('C1: an oversized upload is rejected before decoding', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    headers: { 'content-length': String(50 * 1024 * 1024) },
    body: uploadBody('big.png', 'image/png', makePng(2, 2)),
  });
  assert.equal(res.statusCode, 413);
});

test('C2: undecodable base64 is rejected', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(MEDIA, prisma, {
    method: 'POST',
    cookie,
    body: { filename: 'x.png', contentType: 'image/png', dataBase64: '!!!!' },
  });
  assert.equal(res.statusCode, 400);
});

// ---------------------------------------------------------------------------
// B2 / B9 — media reference tracking
// ---------------------------------------------------------------------------

test('B2/B9: a file shared by two records survives a delete and is removed with the last reference', async () => {
  const prisma = createFakePrisma();
  const media = loadModule('lib/media.js', prisma);
  const url = `/uploads/${Date.now()}-shared-test.png`;
  const filePath = localPathFor(url);

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(filePath, makePng(1, 1));

  await prisma.project.create({ data: { id: 'a', title: 'A', image: url } });
  await prisma.project.create({ data: { id: 'b', title: 'B', images: JSON.stringify([url]) } });

  const whileShared = await media.deleteManagedFileIfUnreferenced(url, prisma);
  assert.equal(whileShared.deleted, false);
  assert.equal(whileShared.reason, 'referenced');
  assert.ok(fs.existsSync(filePath), 'shared file must not be deleted');

  await prisma.project.delete({ where: { id: 'b' } });
  await prisma.project.delete({ where: { id: 'a' } });

  const whenOrphaned = await media.deleteManagedFileIfUnreferenced(url, prisma);
  assert.equal(whenOrphaned.deleted, true);
  assert.equal(fs.existsSync(filePath), false);
});

test('B2/B9: only application-managed files can ever be deleted', async () => {
  const prisma = createFakePrisma();
  const media = loadModule('lib/media.js', prisma);
  const result = await media.deleteManagedFileIfUnreferenced('https://evil.example/whatever.png', prisma);
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'unmanaged');
});

test('B2/B9: deleting a record through the API removes only unreferenced uploads', async () => {
  const prisma = createFakePrisma();
  const { hashPassword } = loadModule('lib/auth.js', prisma);
  await prisma.adminUser.create({
    data: { email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD), name: 'Admin', sessionVersion: 1 },
  });
  const auth = loadModule('api/auth/[...route].js', prisma);
  const loginRes = await callHandler(
    auth,
    mockReq({ method: 'POST', url: '/api/auth/login', query: { route: 'login' }, body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  );
  const cookie = cookieFrom(loginRes);

  const shared = `/uploads/${Date.now()}-api-shared.png`;
  const onlyOne = `/uploads/${Date.now()}-api-solo.png`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(localPathFor(shared), makePng(1, 1));
  fs.writeFileSync(localPathFor(onlyOne), makePng(1, 1));

  await prisma.project.create({ data: { id: 'p1', title: 'P1', image: shared } });
  await prisma.project.create({ data: { id: 'p2', title: 'P2', image: onlyOne } });

  const res = await call('api/admin/[resource]/[id].js', prisma, {
    method: 'DELETE',
    query: { resource: 'projects', id: 'p2' },
    cookie,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(fs.existsSync(localPathFor(onlyOne)), false, 'solely-owned upload should be removed');
  assert.ok(fs.existsSync(localPathFor(shared)), 'upload referenced by another record must survive');

  cleanup(shared);
  cleanup(onlyOne);
});

// ---------------------------------------------------------------------------
// B4 — bulk import
// ---------------------------------------------------------------------------

test('B4/A2: import sanitises HTML rather than storing it raw', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(IMPORT, prisma, {
    method: 'POST',
    cookie,
    body: {
      collections: {
        projects: [{ id: 'imp1', title: 'Imported', fullDesc: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>' }],
      },
    },
  });
  assert.equal(res.statusCode, 200);
  const stored = await prisma.project.findUnique({ where: { id: 'imp1' } });
  assert.ok(!/script/i.test(stored.fullDesc));
  assert.ok(!/onerror/i.test(stored.fullDesc));
  assert.match(stored.fullDesc, /<p>ok<\/p>/);
});

test('B4: an invalid import is rejected as a whole and writes nothing', async () => {
  const { prisma, cookie } = await bootstrap();
  await prisma.project.create({ data: { id: 'existing', title: 'Existing' } });

  const res = await call(IMPORT, prisma, {
    method: 'POST',
    cookie,
    body: {
      collections: {
        projects: [
          { id: 'good1', title: 'Good' },
          { id: 'bad1', title: 'Bad', githubUrl: 'javascript:alert(1)' },
        ],
      },
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'IMPORT_VALIDATION');
  assert.equal(await prisma.project.count(), 1, 'no partial import may be applied');
  assert.equal(await prisma.project.findUnique({ where: { id: 'good1' } }), null);
});

test('B4: import cannot create administrator, session or internal records', async () => {
  const { prisma, cookie } = await bootstrap();
  const adminsBefore = await prisma.adminUser.count();
  const sessionsBefore = await prisma.session.count();

  const res = await call(IMPORT, prisma, {
    method: 'POST',
    cookie,
    body: {
      adminUser: [{ id: 'hax', email: 'attacker@evil.test', passwordHash: '$2a$12$abcdefghijklmnopqrstuv' }],
      session: [{ id: 'hax-session', userId: 'hax' }],
      auditLog: [{ id: 'hax-log' }],
      collections: { projects: [{ id: 'ok1', title: 'Fine' }] },
      singletons: {},
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(await prisma.adminUser.count(), adminsBefore);
  assert.equal(await prisma.session.count(), sessionsBefore);
  assert.equal(await prisma.auditLog.findUnique({ where: { id: 'hax-log' } }), null);
  assert.ok(await prisma.project.findUnique({ where: { id: 'ok1' } }));
});

test('B4: an oversized import body is rejected before processing', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(IMPORT, prisma, {
    method: 'POST',
    cookie,
    headers: { 'content-length': String(50 * 1024 * 1024) },
    body: { collections: {} },
  });
  assert.equal(res.statusCode, 413);
});

test('B4: a mid-import failure rolls the whole transaction back', async () => {
  const { prisma, cookie } = await bootstrap();
  await prisma.project.create({ data: { id: 'keep', title: 'Keep me' } });

  const originalCreate = prisma.skill.create;
  prisma.skill.create = async () => { throw new Error('simulated database failure'); };

  const res = await call(IMPORT, prisma, {
    method: 'POST',
    cookie,
    body: {
      collections: {
        // "projects" is applied before "skills", so this row is written first
        // and must be rolled back when the skills write fails.
        projects: [{ id: 'newp', title: 'Should be rolled back' }],
        skills: [{ id: 'news', name: 'New skill', category: 'X' }],
      },
    },
  });

  prisma.skill.create = originalCreate;

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, 'INTERNAL_ERROR');
  assert.equal(await prisma.project.findUnique({ where: { id: 'newp' } }), null);
  assert.equal((await prisma.project.findUnique({ where: { id: 'keep' } })).title, 'Keep me');
});

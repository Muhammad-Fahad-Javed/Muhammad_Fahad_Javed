-- Profile sync: GitHub / LinkedIn integrations.
--
-- Purely additive. No existing column is dropped, renamed or rewritten, so it
-- is safe to apply on a live database and safe to roll back by reverting the
-- deployment (the previous code simply ignores these tables).
--
-- Generated offline with:
--   prisma migrate diff --from-schema-datamodel <before> \
--                       --to-schema-datamodel prisma/schema.prisma --script

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "githubRepo" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "repoUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GithubSection" ADD COLUMN     "syncAvatar" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "accountLabel" TEXT NOT NULL DEFAULT '',
    "accountId" TEXT NOT NULL DEFAULT '',
    "scopes" TEXT NOT NULL DEFAULT '',
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldState" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "field" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "syncedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ok',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "valueHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "fieldsChanged" INTEGER NOT NULL DEFAULT 0,
    "fieldsSkipped" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_provider_key" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "FieldState_entity_entityId_idx" ON "FieldState"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldState_entity_entityId_field_key" ON "FieldState"("entity", "entityId", "field");

-- CreateIndex
CREATE INDEX "SyncRun_provider_startedAt_idx" ON "SyncRun"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

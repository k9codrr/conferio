BEGIN;

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedReason" TEXT,
    "planId" TEXT,
    "planExpiresAt" TIMESTAMP(3),
    "planSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "moduleOverrides" JSONB NOT NULL DEFAULT '{}',
    "limitOverrides" JSONB NOT NULL DEFAULT '{}',
    "billingEmail" TEXT,
    "razorpayCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "priceYearly" INTEGER NOT NULL DEFAULT 0,
    "maxTeams" INTEGER NOT NULL DEFAULT 1,
    "maxMembers" INTEGER NOT NULL DEFAULT 5,
    "maxStorageGb" INTEGER NOT NULL DEFAULT 5,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "razorpayPlanIdMonthly" TEXT,
    "razorpayPlanIdYearly" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "razorpaySubscriptionId" TEXT NOT NULL,
    "razorpayPlanId" TEXT NOT NULL,
    "shortUrl" TEXT,
    "currentStart" TIMESTAMP(3),
    "currentEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspacePayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpayInvoiceId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "method" TEXT,
    "email" TEXT,
    "errorDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspacePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RazorpayWebhookEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Workspace_planId_idx" ON "Workspace"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPlan_key_key" ON "PlatformPlan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSubscription_razorpaySubscriptionId_key" ON "WorkspaceSubscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_workspaceId_idx" ON "WorkspaceSubscription"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_status_idx" ON "WorkspaceSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspacePayment_razorpayPaymentId_key" ON "WorkspacePayment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "WorkspacePayment_workspaceId_idx" ON "WorkspacePayment"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspacePayment_createdAt_idx" ON "WorkspacePayment"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_targetType_targetId_idx" ON "PlatformAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Team_workspaceId_idx" ON "Team"("workspaceId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspacePayment" ADD CONSTRAINT "WorkspacePayment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspacePayment" ADD CONSTRAINT "WorkspacePayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WorkspaceSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Seed default plans (editable from /admin/plans) ─────────────────────────
INSERT INTO "PlatformPlan" ("id","key","name","description","currency","priceMonthly","priceYearly","maxTeams","maxMembers","maxStorageGb","modules","features","isActive","isPublic","isDefault","sortOrder","updatedAt") VALUES
(gen_random_uuid()::text,'free','Free','For small teams getting started','INR',0,0,1,5,5,
  ARRAY['chat','scrumboard','docs','notes','drive','calendar','events','meetings','timesheet','calls'],
  ARRAY['1 team','Up to 5 members','5 GB storage','Chat, boards, docs & drive'],true,true,true,0,CURRENT_TIMESTAMP),
(gen_random_uuid()::text,'starter','Starter','Growing teams that need more room','INR',99900,999000,3,25,50,
  ARRAY['chat','scrumboard','docs','notes','drive','calendar','events','meetings','timesheet','calls','workload','clips','whiteboard'],
  ARRAY['Up to 3 teams','Up to 25 members','50 GB storage','Workload, clips & whiteboard'],true,true,false,1,CURRENT_TIMESTAMP),
(gen_random_uuid()::text,'pro','Pro','Multi-team companies with sales & mail','INR',299900,2999000,5,100,250,
  ARRAY['chat','scrumboard','docs','notes','drive','calendar','events','meetings','timesheet','calls','workload','clips','whiteboard','crm','mail'],
  ARRAY['Up to 5 teams','Up to 100 members','250 GB storage','CRM & Mail'],true,true,false,2,CURRENT_TIMESTAMP),
(gen_random_uuid()::text,'enterprise','Enterprise','Unlimited teams with every module','INR',999900,9999000,-1,-1,1000,
  ARRAY['chat','scrumboard','docs','notes','drive','calendar','events','meetings','timesheet','calls','workload','clips','whiteboard','crm','mail','ai'],
  ARRAY['Unlimited teams','Unlimited members','1 TB storage','AI assistant','Priority support'],true,true,false,3,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- ─── Backfill: one workspace per team owner, holding all teams they own ─────
-- Owner of a team = its earliest OWNER, else earliest ADMIN, else earliest member.
CREATE TEMP TABLE _team_owner AS
SELECT DISTINCT ON (tm."teamId") tm."teamId", tm."userId"
FROM "TeamMember" tm
ORDER BY tm."teamId",
  CASE tm."role" WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END,
  tm."createdAt";

-- Existing workspaces are comped onto Enterprise (no expiry) so no one loses a module
-- they use today; platform admins can change plans from /admin.
INSERT INTO "Workspace" ("id","name","slug","ownerId","planId","planSource","billingEmail","updatedAt")
SELECT gen_random_uuid()::text,
       u."name" || '''s Workspace',
       trim(both '-' from regexp_replace(lower(u."name"), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(u."id"), 1, 6),
       u."id",
       (SELECT "id" FROM "PlatformPlan" WHERE "key" = 'enterprise'),
       'MANUAL',
       u."email",
       CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId" FROM _team_owner) o
JOIN "User" u ON u."id" = o."userId";

UPDATE "Team" t
SET "workspaceId" = w."id"
FROM _team_owner o
JOIN "Workspace" w ON w."ownerId" = o."userId"
WHERE t."id" = o."teamId";

-- Teams with no members get a workspace of their own.
INSERT INTO "Workspace" ("id","name","slug","planId","planSource","updatedAt")
SELECT 'ws_' || t."id", t."name", 'team-' || t."slug" || '-' || substr(md5(t."id"), 1, 6),
       (SELECT "id" FROM "PlatformPlan" WHERE "key" = 'enterprise'), 'MANUAL', CURRENT_TIMESTAMP
FROM "Team" t WHERE t."workspaceId" IS NULL;

UPDATE "Team" t SET "workspaceId" = 'ws_' || t."id" WHERE t."workspaceId" IS NULL;

-- Global module switches start with everything on.
INSERT INTO "PlatformSetting" ("key","value","updatedAt") VALUES ('modules','{}'::jsonb,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

DROP TABLE _team_owner;

COMMIT;

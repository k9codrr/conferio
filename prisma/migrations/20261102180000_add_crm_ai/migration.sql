-- CreateEnum
CREATE TYPE "CrmEnrichmentStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "CrmSuggestionStatus" AS ENUM ('PROPOSED', 'APPLIED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "CrmActivityType" ADD VALUE 'ENRICHMENT';

-- AlterTable
ALTER TABLE "crm_companies" ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "enrichmentError" TEXT,
ADD COLUMN     "enrichmentStatus" "CrmEnrichmentStatus" NOT NULL DEFAULT 'IDLE';

-- AlterTable
ALTER TABLE "crm_contacts" ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "enrichmentError" TEXT,
ADD COLUMN     "enrichmentStatus" "CrmEnrichmentStatus" NOT NULL DEFAULT 'IDLE';

-- CreateTable
CREATE TABLE "crm_ai_conversations" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "title" TEXT,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "display" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_suggestions" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "evidence" TEXT,
    "basis" TEXT NOT NULL,
    "status" "CrmSuggestionStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_briefs" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "summary" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_ai_conversations_teamId_userId_updatedAt_idx" ON "crm_ai_conversations"("teamId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "crm_ai_conversations_companyId_idx" ON "crm_ai_conversations"("companyId");

-- CreateIndex
CREATE INDEX "crm_ai_conversations_contactId_idx" ON "crm_ai_conversations"("contactId");

-- CreateIndex
CREATE INDEX "crm_ai_conversations_dealId_idx" ON "crm_ai_conversations"("dealId");

-- CreateIndex
CREATE INDEX "crm_suggestions_companyId_status_idx" ON "crm_suggestions"("companyId", "status");

-- CreateIndex
CREATE INDEX "crm_suggestions_contactId_status_idx" ON "crm_suggestions"("contactId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "crm_briefs_companyId_key" ON "crm_briefs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_briefs_contactId_key" ON "crm_briefs"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_briefs_dealId_key" ON "crm_briefs"("dealId");

-- AddForeignKey
ALTER TABLE "crm_ai_conversations" ADD CONSTRAINT "crm_ai_conversations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_ai_conversations" ADD CONSTRAINT "crm_ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_ai_conversations" ADD CONSTRAINT "crm_ai_conversations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_ai_conversations" ADD CONSTRAINT "crm_ai_conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_ai_conversations" ADD CONSTRAINT "crm_ai_conversations_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_suggestions" ADD CONSTRAINT "crm_suggestions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_suggestions" ADD CONSTRAINT "crm_suggestions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_suggestions" ADD CONSTRAINT "crm_suggestions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_suggestions" ADD CONSTRAINT "crm_suggestions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_briefs" ADD CONSTRAINT "crm_briefs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_briefs" ADD CONSTRAINT "crm_briefs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_briefs" ADD CONSTRAINT "crm_briefs_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_briefs" ADD CONSTRAINT "crm_briefs_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;


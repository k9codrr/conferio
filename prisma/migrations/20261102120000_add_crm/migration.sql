-- CreateEnum
CREATE TYPE "CrmDealStage" AS ENUM ('DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY', 'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK', 'STAGE_CHANGE');

-- CreateEnum
CREATE TYPE "CrmRecordSource" AS ENUM ('MANUAL', 'IMPORT', 'EMAIL', 'CALENDAR');

-- CreateEnum
CREATE TYPE "CrmFieldEntity" AS ENUM ('COMPANY', 'CONTACT', 'DEAL');

-- CreateEnum
CREATE TYPE "CrmFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT', 'URL', 'EMAIL', 'PHONE', 'USER');

-- CreateTable
CREATE TABLE "crm_companies" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "website" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "stateCode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "twitterUrl" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "primaryContactId" TEXT,
    "source" "CrmRecordSource" NOT NULL DEFAULT 'MANUAL',
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_company_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "linkedinUrl" TEXT,
    "twitterUrl" TEXT,
    "githubUrl" TEXT,
    "imageUrl" TEXT,
    "companyId" TEXT,
    "ownerId" TEXT,
    "source" "CrmRecordSource" NOT NULL DEFAULT 'MANUAL',
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "stage" "CrmDealStage" NOT NULL DEFAULT 'DEMO_BOOKED',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deal_contacts" (
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "crm_deal_contacts_pkey" PRIMARY KEY ("dealId","contactId")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "CrmActivityType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_field_definitions" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "entity" "CrmFieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CrmFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOnSheet" BOOLEAN NOT NULL DEFAULT true,
    "showOnTable" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_field_options" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "crm_field_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_field_values" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "text" TEXT,
    "number" DECIMAL(24,4),
    "date" TIMESTAMP(3),
    "bool" BOOLEAN,
    "optionId" TEXT,
    "userId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_settings" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "reportingCurrency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRates" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_companies_primaryContactId_key" ON "crm_companies"("primaryContactId");

-- CreateIndex
CREATE INDEX "crm_companies_teamId_name_idx" ON "crm_companies"("teamId", "name");

-- CreateIndex
CREATE INDEX "crm_companies_teamId_ownerId_idx" ON "crm_companies"("teamId", "ownerId");

-- CreateIndex
CREATE INDEX "crm_companies_teamId_lastActivityAt_idx" ON "crm_companies"("teamId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_companies_teamId_domain_key" ON "crm_companies"("teamId", "domain");

-- CreateIndex
CREATE INDEX "crm_company_members_userId_idx" ON "crm_company_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_company_members_companyId_userId_key" ON "crm_company_members"("companyId", "userId");

-- CreateIndex
CREATE INDEX "crm_contacts_teamId_companyId_idx" ON "crm_contacts"("teamId", "companyId");

-- CreateIndex
CREATE INDEX "crm_contacts_teamId_ownerId_idx" ON "crm_contacts"("teamId", "ownerId");

-- CreateIndex
CREATE INDEX "crm_contacts_teamId_lastActivityAt_idx" ON "crm_contacts"("teamId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contacts_teamId_email_key" ON "crm_contacts"("teamId", "email");

-- CreateIndex
CREATE INDEX "crm_deals_teamId_companyId_idx" ON "crm_deals"("teamId", "companyId");

-- CreateIndex
CREATE INDEX "crm_deals_teamId_ownerId_idx" ON "crm_deals"("teamId", "ownerId");

-- CreateIndex
CREATE INDEX "crm_deals_teamId_stage_idx" ON "crm_deals"("teamId", "stage");

-- CreateIndex
CREATE INDEX "crm_deals_teamId_expectedCloseDate_idx" ON "crm_deals"("teamId", "expectedCloseDate");

-- CreateIndex
CREATE INDEX "crm_deals_teamId_lastActivityAt_idx" ON "crm_deals"("teamId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "crm_deal_contacts_contactId_idx" ON "crm_deal_contacts"("contactId");

-- CreateIndex
CREATE INDEX "crm_activities_teamId_createdAt_idx" ON "crm_activities"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_activities_companyId_createdAt_idx" ON "crm_activities"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_activities_contactId_createdAt_idx" ON "crm_activities"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_activities_dealId_createdAt_idx" ON "crm_activities"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_activities_teamId_type_completedAt_dueAt_idx" ON "crm_activities"("teamId", "type", "completedAt", "dueAt");

-- CreateIndex
CREATE INDEX "crm_activities_assigneeId_idx" ON "crm_activities"("assigneeId");

-- CreateIndex
CREATE INDEX "crm_activities_createdById_idx" ON "crm_activities"("createdById");

-- CreateIndex
CREATE INDEX "crm_field_definitions_teamId_entity_position_idx" ON "crm_field_definitions"("teamId", "entity", "position");

-- CreateIndex
CREATE UNIQUE INDEX "crm_field_definitions_teamId_entity_key_key" ON "crm_field_definitions"("teamId", "entity", "key");

-- CreateIndex
CREATE INDEX "crm_field_options_fieldId_position_idx" ON "crm_field_options"("fieldId", "position");

-- CreateIndex
CREATE INDEX "crm_field_values_companyId_idx" ON "crm_field_values"("companyId");

-- CreateIndex
CREATE INDEX "crm_field_values_contactId_idx" ON "crm_field_values"("contactId");

-- CreateIndex
CREATE INDEX "crm_field_values_dealId_idx" ON "crm_field_values"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_field_values_fieldId_companyId_key" ON "crm_field_values"("fieldId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_field_values_fieldId_contactId_key" ON "crm_field_values"("fieldId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_field_values_fieldId_dealId_key" ON "crm_field_values"("fieldId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_settings_teamId_key" ON "crm_settings"("teamId");

-- AddForeignKey
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_company_members" ADD CONSTRAINT "crm_company_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_company_members" ADD CONSTRAINT "crm_company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_company_members" ADD CONSTRAINT "crm_company_members_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_definitions" ADD CONSTRAINT "crm_field_definitions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_options" ADD CONSTRAINT "crm_field_options_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "crm_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_values" ADD CONSTRAINT "crm_field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "crm_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_values" ADD CONSTRAINT "crm_field_values_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_values" ADD CONSTRAINT "crm_field_values_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_values" ADD CONSTRAINT "crm_field_values_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_values" ADD CONSTRAINT "crm_field_values_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "crm_field_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_field_values" ADD CONSTRAINT "crm_field_values_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_settings" ADD CONSTRAINT "crm_settings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;


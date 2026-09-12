-- Multi-state ownership, effective rule versions, and durable resolution snapshots.
-- Generated 2026-09-12 06:04:19Z.
-- VERIFIED APPLIED to Simple_RAS_CRM_DEV on 2026-09-12; verify independently on every other target.
-- Additive rollout only: organization/location links on existing records remain nullable.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "JurisdictionLevel" AS ENUM ('COUNTRY', 'STATE', 'LOCAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProviderEnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RuleAuthorityKind" AS ENUM ('FEDERAL', 'JURISDICTION', 'PAYER_PLAN', 'SERVICE_LOCATION', 'ORGANIZATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RuleLifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RuleCategory" AS ENUM ('BILLING', 'EVV', 'CREDENTIAL', 'CONSENT', 'RETENTION', 'INCIDENT', 'EMPLOYMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Organization_slug_key" UNIQUE ("slug"),
  CONSTRAINT "Organization_slug_nonblank" CHECK (btrim("slug") <> ''),
  CONSTRAINT "Organization_name_nonblank" CHECK (btrim("name") <> '')
);

CREATE TABLE IF NOT EXISTS "ServiceLocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "stateCode" TEXT,
  "postalCode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "activeFrom" TIMESTAMPTZ,
  "activeTo" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ServiceLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceLocation_organizationId_code_key" UNIQUE ("organizationId", "code"),
  CONSTRAINT "ServiceLocation_code_nonblank" CHECK (btrim("code") <> ''),
  CONSTRAINT "ServiceLocation_name_nonblank" CHECK (btrim("name") <> ''),
  CONSTRAINT "ServiceLocation_timezone_nonblank" CHECK (btrim("timezone") <> ''),
  CONSTRAINT "ServiceLocation_effective_interval" CHECK ("activeTo" IS NULL OR "activeFrom" IS NULL OR "activeTo" > "activeFrom")
);

CREATE TABLE IF NOT EXISTS "Jurisdiction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "level" "JurisdictionLevel" NOT NULL,
  "parentId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Jurisdiction_code_key" UNIQUE ("code"),
  CONSTRAINT "Jurisdiction_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT,
  CONSTRAINT "Jurisdiction_code_nonblank" CHECK (btrim("code") <> ''),
  CONSTRAINT "Jurisdiction_name_nonblank" CHECK (btrim("name") <> ''),
  CONSTRAINT "Jurisdiction_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id")
);

CREATE TABLE IF NOT EXISTS "ServiceLocationJurisdiction" (
  "serviceLocationId" UUID NOT NULL,
  "jurisdictionId" UUID NOT NULL,
  CONSTRAINT "ServiceLocationJurisdiction_pkey" PRIMARY KEY ("serviceLocationId", "jurisdictionId"),
  CONSTRAINT "ServiceLocationJurisdiction_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceLocationJurisdiction_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "PayerPlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "jurisdictionId" UUID,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payerCode" TEXT,
  "programCode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMPTZ,
  "effectiveTo" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PayerPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayerPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "PayerPlan_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT,
  CONSTRAINT "PayerPlan_organizationId_code_key" UNIQUE ("organizationId", "code"),
  CONSTRAINT "PayerPlan_code_nonblank" CHECK (btrim("code") <> ''),
  CONSTRAINT "PayerPlan_name_nonblank" CHECK (btrim("name") <> ''),
  CONSTRAINT "PayerPlan_effective_interval" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE TABLE IF NOT EXISTS "ProviderEnrollment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "payerPlanId" UUID NOT NULL,
  "serviceLocationId" UUID,
  "providerUserId" UUID,
  "enrollmentType" TEXT NOT NULL,
  "providerIdentifier" TEXT,
  "status" "ProviderEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
  "effectiveFrom" TIMESTAMPTZ,
  "effectiveTo" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ProviderEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "ProviderEnrollment_payerPlanId_fkey" FOREIGN KEY ("payerPlanId") REFERENCES "PayerPlan"("id") ON DELETE RESTRICT,
  CONSTRAINT "ProviderEnrollment_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT,
  CONSTRAINT "ProviderEnrollment_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ProviderEnrollment_type_nonblank" CHECK (btrim("enrollmentType") <> ''),
  CONSTRAINT "ProviderEnrollment_effective_interval" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE TABLE IF NOT EXISTS "RuleSet" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "category" "RuleCategory" NOT NULL,
  "authorityKind" "RuleAuthorityKind" NOT NULL,
  "organizationId" UUID,
  "serviceLocationId" UUID,
  "jurisdictionId" UUID,
  "payerPlanId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuleSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "RuleSet_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT,
  CONSTRAINT "RuleSet_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT,
  CONSTRAINT "RuleSet_payerPlanId_fkey" FOREIGN KEY ("payerPlanId") REFERENCES "PayerPlan"("id") ON DELETE RESTRICT,
  CONSTRAINT "RuleSet_key_nonblank" CHECK (btrim("key") <> ''),
  CONSTRAINT "RuleSet_exact_authority" CHECK (
    ("authorityKind" = 'FEDERAL' AND "organizationId" IS NULL AND "serviceLocationId" IS NULL AND "jurisdictionId" IS NULL AND "payerPlanId" IS NULL) OR
    ("authorityKind" = 'JURISDICTION' AND "organizationId" IS NULL AND "serviceLocationId" IS NULL AND "jurisdictionId" IS NOT NULL AND "payerPlanId" IS NULL) OR
    ("authorityKind" = 'PAYER_PLAN' AND "organizationId" IS NULL AND "serviceLocationId" IS NULL AND "jurisdictionId" IS NULL AND "payerPlanId" IS NOT NULL) OR
    ("authorityKind" = 'SERVICE_LOCATION' AND "organizationId" IS NULL AND "serviceLocationId" IS NOT NULL AND "jurisdictionId" IS NULL AND "payerPlanId" IS NULL) OR
    ("authorityKind" = 'ORGANIZATION' AND "organizationId" IS NOT NULL AND "serviceLocationId" IS NULL AND "jurisdictionId" IS NULL AND "payerPlanId" IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS "RuleVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ruleSetId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "RuleLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMPTZ NOT NULL,
  "effectiveTo" TIMESTAMPTZ,
  "payload" JSONB NOT NULL,
  "sourceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "contentHash" TEXT NOT NULL,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuleVersion_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE RESTRICT,
  CONSTRAINT "RuleVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "RuleVersion_ruleSetId_version_key" UNIQUE ("ruleSetId", "version"),
  CONSTRAINT "RuleVersion_ruleSetId_contentHash_key" UNIQUE ("ruleSetId", "contentHash"),
  CONSTRAINT "RuleVersion_version_positive" CHECK ("version" > 0),
  CONSTRAINT "RuleVersion_effective_interval" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "RuleVersion_content_hash" CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RuleVersion_source_refs_array" CHECK (jsonb_typeof("sourceRefs") = 'array'),
  CONSTRAINT "RuleVersion_approval_pair" CHECK (("approvedById" IS NULL) = ("approvedAt" IS NULL)),
  CONSTRAINT "RuleVersion_active_approved" CHECK ("status" <> 'ACTIVE' OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS "ResolvedRuleSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sessionId" UUID NOT NULL,
  "decisionKey" TEXT NOT NULL,
  "evaluatorVersion" TEXT NOT NULL,
  "resolvedFacts" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "supersedesId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ResolvedRuleSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResolvedRuleSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT,
  CONSTRAINT "ResolvedRuleSnapshot_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ResolvedRuleSnapshot"("id") ON DELETE RESTRICT,
  CONSTRAINT "ResolvedRuleSnapshot_sessionId_decisionKey_contentHash_key" UNIQUE ("sessionId", "decisionKey", "contentHash"),
  CONSTRAINT "ResolvedRuleSnapshot_decision_nonblank" CHECK (btrim("decisionKey") <> ''),
  CONSTRAINT "ResolvedRuleSnapshot_evaluator_nonblank" CHECK (btrim("evaluatorVersion") <> ''),
  CONSTRAINT "ResolvedRuleSnapshot_content_hash" CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ResolvedRuleSnapshot_not_self_superseding" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id")
);

CREATE TABLE IF NOT EXISTS "ResolvedRuleVersionSelection" (
  "snapshotId" UUID NOT NULL,
  "ruleVersionId" UUID NOT NULL,
  "precedence" INTEGER NOT NULL,
  CONSTRAINT "ResolvedRuleVersionSelection_pkey" PRIMARY KEY ("snapshotId", "ruleVersionId"),
  CONSTRAINT "ResolvedRuleVersionSelection_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ResolvedRuleSnapshot"("id") ON DELETE CASCADE,
  CONSTRAINT "ResolvedRuleVersionSelection_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE RESTRICT,
  CONSTRAINT "ResolvedRuleVersionSelection_snapshotId_precedence_key" UNIQUE ("snapshotId", "precedence"),
  CONSTRAINT "ResolvedRuleVersionSelection_precedence_nonnegative" CHECK ("precedence" >= 0)
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organizationId" UUID;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "organizationId" UUID;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "primaryServiceLocationId" UUID;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "organizationId" UUID;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "serviceLocationId" UUID;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Client" ADD CONSTRAINT "Client_primaryServiceLocationId_fkey" FOREIGN KEY ("primaryServiceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "Client_organizationId_idx" ON "Client"("organizationId");
CREATE INDEX IF NOT EXISTS "Client_primaryServiceLocationId_idx" ON "Client"("primaryServiceLocationId");
CREATE INDEX IF NOT EXISTS "Session_organizationId_scheduledStart_idx" ON "Session"("organizationId", "scheduledStart");
CREATE INDEX IF NOT EXISTS "Session_serviceLocationId_scheduledStart_idx" ON "Session"("serviceLocationId", "scheduledStart");
CREATE INDEX IF NOT EXISTS "ServiceLocation_organizationId_isActive_idx" ON "ServiceLocation"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "Jurisdiction_parentId_idx" ON "Jurisdiction"("parentId");
CREATE INDEX IF NOT EXISTS "Jurisdiction_level_idx" ON "Jurisdiction"("level");
CREATE INDEX IF NOT EXISTS "ServiceLocationJurisdiction_jurisdictionId_idx" ON "ServiceLocationJurisdiction"("jurisdictionId");
CREATE INDEX IF NOT EXISTS "PayerPlan_jurisdictionId_idx" ON "PayerPlan"("jurisdictionId");
CREATE INDEX IF NOT EXISTS "PayerPlan_organizationId_isActive_idx" ON "PayerPlan"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "ProviderEnrollment_organizationId_status_idx" ON "ProviderEnrollment"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "ProviderEnrollment_payerPlanId_status_idx" ON "ProviderEnrollment"("payerPlanId", "status");
CREATE INDEX IF NOT EXISTS "ProviderEnrollment_serviceLocationId_idx" ON "ProviderEnrollment"("serviceLocationId");
CREATE INDEX IF NOT EXISTS "ProviderEnrollment_providerUserId_idx" ON "ProviderEnrollment"("providerUserId");
CREATE INDEX IF NOT EXISTS "RuleSet_key_category_idx" ON "RuleSet"("key", "category");
CREATE INDEX IF NOT EXISTS "RuleSet_organizationId_idx" ON "RuleSet"("organizationId");
CREATE INDEX IF NOT EXISTS "RuleSet_serviceLocationId_idx" ON "RuleSet"("serviceLocationId");
CREATE INDEX IF NOT EXISTS "RuleSet_jurisdictionId_idx" ON "RuleSet"("jurisdictionId");
CREATE INDEX IF NOT EXISTS "RuleSet_payerPlanId_idx" ON "RuleSet"("payerPlanId");
CREATE UNIQUE INDEX IF NOT EXISTS "RuleSet_federal_key_category_key" ON "RuleSet"("key", "category") WHERE "authorityKind" = 'FEDERAL';
CREATE UNIQUE INDEX IF NOT EXISTS "RuleSet_jurisdiction_key_category_key" ON "RuleSet"("jurisdictionId", "key", "category") WHERE "authorityKind" = 'JURISDICTION';
CREATE UNIQUE INDEX IF NOT EXISTS "RuleSet_payerPlan_key_category_key" ON "RuleSet"("payerPlanId", "key", "category") WHERE "authorityKind" = 'PAYER_PLAN';
CREATE UNIQUE INDEX IF NOT EXISTS "RuleSet_serviceLocation_key_category_key" ON "RuleSet"("serviceLocationId", "key", "category") WHERE "authorityKind" = 'SERVICE_LOCATION';
CREATE UNIQUE INDEX IF NOT EXISTS "RuleSet_organization_key_category_key" ON "RuleSet"("organizationId", "key", "category") WHERE "authorityKind" = 'ORGANIZATION';
CREATE INDEX IF NOT EXISTS "RuleVersion_ruleSetId_status_effectiveFrom_effectiveTo_idx" ON "RuleVersion"("ruleSetId", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX IF NOT EXISTS "RuleVersion_approvedById_idx" ON "RuleVersion"("approvedById");
CREATE INDEX IF NOT EXISTS "ResolvedRuleSnapshot_sessionId_decisionKey_createdAt_idx" ON "ResolvedRuleSnapshot"("sessionId", "decisionKey", "createdAt");
CREATE INDEX IF NOT EXISTS "ResolvedRuleSnapshot_supersedesId_idx" ON "ResolvedRuleSnapshot"("supersedesId");
CREATE INDEX IF NOT EXISTS "ResolvedRuleVersionSelection_ruleVersionId_idx" ON "ResolvedRuleVersionSelection"("ruleVersionId");

CREATE OR REPLACE FUNCTION public.prevent_published_rule_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Published rule versions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_rule_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Resolved rule history is immutable';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "RuleVersion_prevent_published_mutation" ON "RuleVersion";
CREATE TRIGGER "RuleVersion_prevent_published_mutation"
BEFORE UPDATE OR DELETE ON "RuleVersion"
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_rule_version_mutation();

DROP TRIGGER IF EXISTS "ResolvedRuleSnapshot_prevent_mutation" ON "ResolvedRuleSnapshot";
CREATE TRIGGER "ResolvedRuleSnapshot_prevent_mutation"
BEFORE UPDATE OR DELETE ON "ResolvedRuleSnapshot"
FOR EACH ROW EXECUTE FUNCTION public.prevent_rule_snapshot_mutation();

DROP TRIGGER IF EXISTS "ResolvedRuleVersionSelection_prevent_mutation" ON "ResolvedRuleVersionSelection";
CREATE TRIGGER "ResolvedRuleVersionSelection_prevent_mutation"
BEFORE UPDATE OR DELETE ON "ResolvedRuleVersionSelection"
FOR EACH ROW EXECUTE FUNCTION public.prevent_rule_snapshot_mutation();

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Jurisdiction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceLocationJurisdiction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayerPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuleSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuleVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResolvedRuleSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResolvedRuleVersionSelection" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "Organization", "ServiceLocation", "Jurisdiction", "ServiceLocationJurisdiction", "PayerPlan", "ProviderEnrollment", "RuleSet", "RuleVersion", "ResolvedRuleSnapshot", "ResolvedRuleVersionSelection" FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_published_rule_version_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_rule_snapshot_mutation() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Accounting packages: Sage's own columns become generic ones shared by every package
-- (Sage, Xero, QuickBooks Online, Zoho Books, FreshBooks, Odoo, Pastel by file).
-- Any Sage setup and sync state from 20261107233000_sage is carried across first.

-- CreateTable
CREATE TABLE "AccountingLink" (
    "provider" TEXT NOT NULL,
    "credentials" TEXT,
    "orgId" TEXT NOT NULL DEFAULT '',
    "orgName" TEXT NOT NULL DEFAULT '',
    "config" JSONB NOT NULL DEFAULT '{}',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingLink_pkey" PRIMARY KEY ("provider")
);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "accountingProvider" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acctAutoSend" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acctLastError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acctLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "acctStartDate" TIMESTAMP(3),
ADD COLUMN     "acctUseKuduNumbers" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Customer" ADD COLUMN     "acctId" TEXT,
ADD COLUMN     "acctLink" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Invoice" ADD COLUMN     "acctCheckedAt" TIMESTAMP(3),
ADD COLUMN     "acctError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acctHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acctId" TEXT,
ADD COLUMN     "acctLink" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acctNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acctSentAt" TIMESTAMP(3);

ALTER TABLE "Payment" ADD COLUMN     "acctError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acctId" TEXT,
ADD COLUMN     "acctLink" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fromAccounting" BOOLEAN NOT NULL DEFAULT false;

-- Carry the Sage setup across. The Sage password was encrypted on its own (not as JSON);
-- readCredentials() in src/lib/accounting/store.ts reads that older form as { password }.
INSERT INTO "AccountingLink" ("provider", "credentials", "orgId", "orgName", "config", "updatedAt")
SELECT 'sage',
       "sagePassword",
       COALESCE("sageCompanyId"::TEXT, ''),
       "sageCompanyName",
       jsonb_build_object(
         'username', "sageUsername",
         'taxType', COALESCE("sageTaxTypeId"::TEXT, ''),
         'zeroTaxType', COALESCE("sageZeroTaxTypeId"::TEXT, ''),
         'item', COALESCE("sageItemId"::TEXT, ''),
         'bankAccount', COALESCE("sageBankAccountId"::TEXT, '')
       ),
       CURRENT_TIMESTAMP
FROM "Settings"
WHERE "id" = 1 AND ("sageUsername" <> '' OR "sagePassword" IS NOT NULL);

UPDATE "Settings" SET
  "accountingProvider" = CASE WHEN "sagePassword" IS NOT NULL THEN 'sage' ELSE '' END,
  "acctAutoSend" = "sageAutoSend",
  "acctUseKuduNumbers" = "sageUseKuduNumbers",
  "acctStartDate" = "sageStartDate",
  "acctLastError" = "sageLastError";

UPDATE "Customer" c SET "acctId" = c."sageId"::TEXT, "acctLink" = 'sage:' || COALESCE(s."sageCompanyId"::TEXT, '')
FROM "Settings" s WHERE s."id" = 1 AND c."sageId" IS NOT NULL;

UPDATE "Invoice" i SET "acctId" = i."sageId"::TEXT, "acctLink" = 'sage:' || COALESCE(s."sageCompanyId"::TEXT, ''),
  "acctNumber" = i."sageNumber", "acctSentAt" = i."sageSentAt", "acctHash" = i."sageHash",
  "acctCheckedAt" = i."sageCheckedAt", "acctError" = i."sageError"
FROM "Settings" s WHERE s."id" = 1 AND (i."sageId" IS NOT NULL OR i."sageError" <> '');

UPDATE "Payment" p SET "acctId" = p."sageId"::TEXT, "acctError" = p."sageError", "fromAccounting" = p."fromSage",
  "acctLink" = CASE WHEN p."sageId" IS NOT NULL OR p."fromSage" THEN 'sage:' || COALESCE(s."sageCompanyId"::TEXT, '') ELSE '' END
FROM "Settings" s WHERE s."id" = 1 AND (p."sageId" IS NOT NULL OR p."fromSage" OR p."sageError" <> '');

-- Drop the Sage-only columns
ALTER TABLE "Customer" DROP COLUMN "sageId";
ALTER TABLE "Invoice" DROP COLUMN "sageCheckedAt", DROP COLUMN "sageError", DROP COLUMN "sageHash",
DROP COLUMN "sageId", DROP COLUMN "sageNumber", DROP COLUMN "sageSentAt";
ALTER TABLE "Payment" DROP COLUMN "fromSage", DROP COLUMN "sageError", DROP COLUMN "sageId";
ALTER TABLE "Settings" DROP COLUMN "sageAutoSend", DROP COLUMN "sageBankAccountId", DROP COLUMN "sageCompanyId",
DROP COLUMN "sageCompanyName", DROP COLUMN "sageItemId", DROP COLUMN "sageItemName", DROP COLUMN "sageLastError",
DROP COLUMN "sagePassword", DROP COLUMN "sageStartDate", DROP COLUMN "sageTaxTypeId", DROP COLUMN "sageUseKuduNumbers",
DROP COLUMN "sageUsername", DROP COLUMN "sageZeroTaxTypeId";

CREATE INDEX "Invoice_acctLink_acctId_idx" ON "Invoice"("acctLink", "acctId");

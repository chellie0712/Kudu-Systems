-- CreateTable
CREATE TABLE "DocTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'DOC-',
    "nextNo" INTEGER NOT NULL DEFAULT 1,
    "showInPortal" BOOLEAN NOT NULL DEFAULT true,
    "letterhead" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDoc" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "letterhead" BOOLEAN NOT NULL DEFAULT true,
    "showInPortal" BOOLEAN NOT NULL DEFAULT true,
    "customerId" TEXT NOT NULL,
    "jobCardId" TEXT,
    "quotationId" TEXT,
    "invoiceId" TEXT,
    "companySignature" TEXT,
    "companySigner" TEXT NOT NULL DEFAULT '',
    "clientSignature" TEXT,
    "clientSignedName" TEXT NOT NULL DEFAULT '',
    "clientSignedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDoc_number_key" ON "GeneratedDoc"("number");

-- CreateIndex
CREATE INDEX "GeneratedDoc_customerId_idx" ON "GeneratedDoc"("customerId");

-- CreateIndex
CREATE INDEX "GeneratedDoc_jobCardId_idx" ON "GeneratedDoc"("jobCardId");

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing custom roles: everyone may make documents; office-based roles may see them all.
UPDATE "CustomRole" SET "permissions" = array_cat("permissions", ARRAY['documents.create']) WHERE NOT ('documents.create' = ANY("permissions"));
UPDATE "CustomRole" SET "permissions" = array_cat("permissions", ARRAY['documents.view']) WHERE "baseRole" = 'OFFICE' AND NOT ('documents.view' = ANY("permissions"));

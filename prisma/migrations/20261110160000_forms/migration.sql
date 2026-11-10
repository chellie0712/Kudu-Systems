-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "linkTo" TEXT NOT NULL DEFAULT '',
    "thankYou" TEXT NOT NULL DEFAULT 'Thank you. We have received your details and will be in touch soon.',
    "createCustomer" BOOLEAN NOT NULL DEFAULT true,
    "createQuery" BOOLEAN NOT NULL DEFAULT false,
    "createTask" BOOLEAN NOT NULL DEFAULT true,
    "taskCategory" TEXT NOT NULL DEFAULT 'Follow-up call',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'staff',
    "customerId" TEXT,
    "jobCardId" TEXT,
    "queryId" TEXT,
    "taskId" TEXT,
    "submittedById" TEXT,
    "submittedBy" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_createdAt_idx" ON "FormSubmission"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "FormSubmission_customerId_idx" ON "FormSubmission"("customerId");

-- CreateIndex
CREATE INDEX "FormSubmission_jobCardId_idx" ON "FormSubmission"("jobCardId");

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Give existing custom roles the form permissions their base role has.
UPDATE "CustomRole" SET "permissions" = array_cat("permissions", ARRAY['forms.fill']) WHERE NOT ('forms.fill' = ANY("permissions"));
UPDATE "CustomRole" SET "permissions" = array_cat("permissions", ARRAY['forms.view']) WHERE "baseRole" = 'OFFICE' AND NOT ('forms.view' = ANY("permissions"));

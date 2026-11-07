-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "statusId" TEXT;

-- CreateTable
CREATE TABLE "JobStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'slate',
    "stage" "JobCardStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JobStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL DEFAULT '',
    "autoAddAll" BOOLEAN NOT NULL DEFAULT false,
    "jobType" TEXT NOT NULL DEFAULT '',
    "requiredForCompletion" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCardChecklist" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "requiredForCompletion" BOOLEAN NOT NULL DEFAULT false,
    "items" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobCardChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobCardChecklist_jobCardId_idx" ON "JobCardChecklist"("jobCardId");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "JobStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCardChecklist" ADD CONSTRAINT "JobCardChecklist_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCardChecklist" ADD CONSTRAINT "JobCardChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Examples to start from; rename or delete them in Settings.
INSERT INTO "JobStatus" ("id", "name", "colour", "stage", "sortOrder") VALUES
  (gen_random_uuid()::text, 'Awaiting parts / products', 'amber', 'IN_PROGRESS', 0),
  (gen_random_uuid()::text, 'Follow-up treatment due', 'violet', 'SCHEDULED', 1),
  (gen_random_uuid()::text, 'Awaiting client access', 'slate', 'SCHEDULED', 2);

INSERT INTO "ChecklistTemplate" ("id", "name", "items", "sortOrder") VALUES
  (gen_random_uuid()::text, 'Safety checklist', E'Client informed of products and re-entry time\nFood, utensils and pet bowls covered or removed\nChildren and pets kept out of treated area\nPPE worn\nSafety data sheets available on site\nEmpty containers removed from site', 0);

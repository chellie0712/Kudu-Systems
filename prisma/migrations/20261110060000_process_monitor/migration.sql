-- AlterTable
ALTER TABLE "JobStatus" ADD COLUMN     "stuckAfterDays" INTEGER;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "invoiceAfterDays" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "jobStuckDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "quoteFollowUpDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "statusTrackingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "JobStatusChange" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "fromStatus" "JobCardStatus",
    "fromStatusId" TEXT,
    "fromName" TEXT NOT NULL DEFAULT '',
    "toStatus" "JobCardStatus" NOT NULL,
    "toStatusId" TEXT,
    "toName" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byName" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "JobStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStatusChange_jobCardId_changedAt_idx" ON "JobStatusChange"("jobCardId", "changedAt");

-- CreateIndex
CREATE INDEX "JobStatusChange_changedAt_idx" ON "JobStatusChange"("changedAt");

-- AddForeignKey
ALTER TABLE "JobStatusChange" ADD CONSTRAINT "JobStatusChange_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;


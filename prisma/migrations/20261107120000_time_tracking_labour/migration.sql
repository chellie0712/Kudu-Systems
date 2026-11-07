-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "labourDescription" TEXT NOT NULL DEFAULT 'Labour',
ADD COLUMN     "labourRate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "labourRoundMinutes" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "labourRate" INTEGER;

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntry_jobCardId_idx" ON "TimeEntry"("jobCardId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_end_idx" ON "TimeEntry"("userId", "end");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "approvalNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "approvalRequestedAt" TIMESTAMP(3),
ADD COLUMN     "approvalRequestedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "invoiceApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceApprovalThreshold" INTEGER NOT NULL DEFAULT 0;


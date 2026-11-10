-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'FAMILY', 'STUDY', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "claimantId" TEXT,
ADD COLUMN     "claimantName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "decisionNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receipt" TEXT,
ADD COLUMN     "reimbursedAt" TIMESTAMP(3),
ADD COLUMN     "reimbursedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "totalPaid" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "approvalNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "approvalRequestedAt" TIMESTAMP(3),
ADD COLUMN     "approvalRequestedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "annualLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 15,
ADD COLUMN     "claimAutoApprove" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextPoNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "poApproval" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "poApprovalThreshold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "poPrefix" TEXT NOT NULL DEFAULT 'PO-',
ADD COLUMN     "quoteApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quoteApprovalThreshold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "supplierEmail" TEXT NOT NULL DEFAULT '',
    "supplierRef" TEXT NOT NULL DEFAULT '',
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "locationId" TEXT,
    "expectedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "approvalRequestedAt" TIMESTAMP(3),
    "approvalRequestedBy" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "approvalNote" TEXT NOT NULL DEFAULT '',
    "orderedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL DEFAULT 'ANNUAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startDate_idx" ON "LeaveRequest"("userId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_claimantId_idx" ON "Expense"("claimantId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Give existing custom roles the new approval-related permissions their base role has.
UPDATE "CustomRole" SET "permissions" = array_cat("permissions", ARRAY['expenses.claim', 'leave.request']) WHERE NOT ('leave.request' = ANY("permissions"));
UPDATE "CustomRole" SET "permissions" = array_cat("permissions", ARRAY['purchases.view', 'purchases.edit', 'leave.viewAll']) WHERE "baseRole" = 'OFFICE' AND NOT ('purchases.view' = ANY("permissions"));

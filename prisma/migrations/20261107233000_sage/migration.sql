-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "sageId" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sageError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sageCheckedAt" TIMESTAMP(3),
ADD COLUMN     "sageHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sageId" INTEGER,
ADD COLUMN     "sageNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sageSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "fromSage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sageError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sageId" INTEGER;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "sageAutoSend" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sageBankAccountId" INTEGER,
ADD COLUMN     "sageCompanyId" INTEGER,
ADD COLUMN     "sageCompanyName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sageItemId" INTEGER,
ADD COLUMN     "sageItemName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sageLastError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sagePassword" TEXT,
ADD COLUMN     "sageStartDate" TIMESTAMP(3),
ADD COLUMN     "sageTaxTypeId" INTEGER,
ADD COLUMN     "sageUseKuduNumbers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sageUsername" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sageZeroTaxTypeId" INTEGER;


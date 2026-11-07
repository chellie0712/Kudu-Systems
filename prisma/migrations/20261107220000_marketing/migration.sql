-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "leadCampaign" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "leadSource" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "googleAdsAccountEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "googleAdsCurrency" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "googleAdsCustomerId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "googleAdsLastError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "googleAdsLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "googleAdsRefreshToken" TEXT;

-- CreateTable
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'Google Ads',
    "campaignId" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "conversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdSpend_date_idx" ON "AdSpend"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpend_channel_campaignId_date_key" ON "AdSpend"("channel", "campaignId", "date");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");


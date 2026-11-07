-- CreateTable
CREATE TABLE "CustomerAsset" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "installedAt" TIMESTAMP(3),
    "serviceMonths" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCheck" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "userName" TEXT NOT NULL DEFAULT '',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAsset_customerId_idx" ON "CustomerAsset"("customerId");

-- CreateIndex
CREATE INDEX "AssetCheck_jobCardId_idx" ON "AssetCheck"("jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCheck_assetId_jobCardId_key" ON "AssetCheck"("assetId", "jobCardId");

-- AddForeignKey
ALTER TABLE "CustomerAsset" ADD CONSTRAINT "CustomerAsset_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheck" ADD CONSTRAINT "AssetCheck_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CustomerAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheck" ADD CONSTRAINT "AssetCheck_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;


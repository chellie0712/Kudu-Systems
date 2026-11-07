-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "response" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "respondedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responseNote" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_email_key" ON "PortalUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_inviteToken_key" ON "PortalUser"("inviteToken");

-- CreateIndex
CREATE INDEX "PortalUser_customerId_idx" ON "PortalUser"("customerId");

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


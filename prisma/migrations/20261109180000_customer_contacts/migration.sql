-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "contactId" TEXT;

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "mobile" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing data: each customer's contact details become its primary contact.
-- Customers with no contact details at all get no contact. Existing documents keep
-- contactId NULL, which prints the primary contact, exactly as they printed before.
INSERT INTO "CustomerContact" ("id", "customerId", "name", "email", "phone", "mobile", "isPrimary", "updatedAt")
SELECT 'cc_' || "id", "id", "contactPerson", "email", "phone", "altPhone", true, CURRENT_TIMESTAMP
FROM "Customer"
WHERE "contactPerson" <> '' OR "email" <> '' OR "phone" <> '' OR "altPhone" <> '';

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OFFICE', 'TECHNICIAN');

-- Everyone who could sign in before roles existed had full access, so existing users become admins.
-- New users default to OFFICE.
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OFFICE';

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "technicianId" TEXT;

-- CreateIndex
CREATE INDEX "JobCard_technicianId_idx" ON "JobCard"("technicianId");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordHash" TEXT;

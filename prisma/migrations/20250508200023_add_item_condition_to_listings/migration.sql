-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'USED');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "condition" "ItemCondition" NOT NULL DEFAULT 'USED';

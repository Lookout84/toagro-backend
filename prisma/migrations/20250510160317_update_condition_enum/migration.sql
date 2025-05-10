/*
  Warnings:

  - The values [NEW,USED] on the enum `ItemCondition` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ItemCondition_new" AS ENUM ('new', 'used');
ALTER TABLE "Listing" ALTER COLUMN "condition" DROP DEFAULT;
ALTER TABLE "Listing" ALTER COLUMN "condition" TYPE "ItemCondition_new" USING ("condition"::text::"ItemCondition_new");
ALTER TYPE "ItemCondition" RENAME TO "ItemCondition_old";
ALTER TYPE "ItemCondition_new" RENAME TO "ItemCondition";
DROP TYPE "ItemCondition_old";
ALTER TABLE "Listing" ALTER COLUMN "condition" SET DEFAULT 'used';
COMMIT;

-- AlterTable
ALTER TABLE "Listing" ALTER COLUMN "condition" SET DEFAULT 'used';

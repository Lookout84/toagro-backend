-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_communityId_fkey";

-- AlterTable
ALTER TABLE "Location" ALTER COLUMN "communityId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

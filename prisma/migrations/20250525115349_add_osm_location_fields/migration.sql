/*
  Warnings:

  - You are about to drop the column `communityId` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `regionId` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the `Community` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Region` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Community" DROP CONSTRAINT "Community_regionId_fkey";

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_communityId_fkey";

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_countryId_fkey";

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_regionId_fkey";

-- DropForeignKey
ALTER TABLE "Region" DROP CONSTRAINT "Region_countryId_fkey";

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "communityId",
DROP COLUMN "regionId",
ADD COLUMN     "addressType" TEXT,
ADD COLUMN     "boundingBox" TEXT[],
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "osmId" INTEGER,
ADD COLUMN     "osmJsonData" JSONB,
ADD COLUMN     "osmType" TEXT,
ADD COLUMN     "placeId" INTEGER,
ADD COLUMN     "region" TEXT,
ALTER COLUMN "countryId" DROP NOT NULL;

-- DropTable
DROP TABLE "Community";

-- DropTable
DROP TABLE "Region";

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

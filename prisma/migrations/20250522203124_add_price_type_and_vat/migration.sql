-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('NETTO', 'BRUTTO');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "priceType" "PriceType" NOT NULL DEFAULT 'NETTO',
ADD COLUMN     "vatIncluded" BOOLEAN NOT NULL DEFAULT false;

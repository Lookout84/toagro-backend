/*
  Warnings:

  - Added the required column `status` to the `CompanyDocument` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompanyDocument" ADD COLUMN     "status" TEXT NOT NULL;

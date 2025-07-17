-- AlterEnum
ALTER TYPE "ScheduledTaskStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "country" TEXT;

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'GASOLINE', 'ELECTRIC', 'HYBRID', 'GAS');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL', 'AUTOMATIC', 'HYDROSTATIC', 'CVT');

-- CreateTable
CREATE TABLE "MotorizedSpec" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "serialNumber" TEXT,
    "enginePower" DOUBLE PRECISION,
    "enginePowerKw" DOUBLE PRECISION,
    "engineModel" TEXT,
    "fuelType" "FuelType" NOT NULL DEFAULT 'DIESEL',
    "fuelCapacity" DOUBLE PRECISION,
    "transmission" "TransmissionType" DEFAULT 'MANUAL',
    "numberOfGears" INTEGER,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "wheelbase" DOUBLE PRECISION,
    "groundClearance" DOUBLE PRECISION,
    "workingWidth" DOUBLE PRECISION,
    "capacity" DOUBLE PRECISION,
    "liftCapacity" DOUBLE PRECISION,
    "threePtHitch" BOOLEAN NOT NULL DEFAULT false,
    "pto" BOOLEAN NOT NULL DEFAULT false,
    "ptoSpeed" TEXT,
    "frontAxle" TEXT,
    "rearAxle" TEXT,
    "frontTireSize" TEXT,
    "rearTireSize" TEXT,
    "hydraulicFlow" DOUBLE PRECISION,
    "hydraulicPressure" DOUBLE PRECISION,
    "grainTankCapacity" DOUBLE PRECISION,
    "headerWidth" DOUBLE PRECISION,
    "threshingWidth" DOUBLE PRECISION,
    "cleaningArea" DOUBLE PRECISION,
    "engineHours" DOUBLE PRECISION,
    "mileage" DOUBLE PRECISION,
    "lastServiceDate" TIMESTAMP(3),
    "nextServiceDate" TIMESTAMP(3),
    "isOperational" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotorizedSpec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotorizedSpec_listingId_key" ON "MotorizedSpec"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MotorizedSpec_serialNumber_key" ON "MotorizedSpec"("serialNumber");

-- AddForeignKey
ALTER TABLE "MotorizedSpec" ADD CONSTRAINT "MotorizedSpec_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

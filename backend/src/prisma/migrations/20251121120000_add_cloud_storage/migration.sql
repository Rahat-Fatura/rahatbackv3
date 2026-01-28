-- AlterEnum
ALTER TYPE "StorageType" ADD VALUE 'google_drive';

-- AlterEnum
ALTER TYPE "ScheduleType" ADD VALUE 'advanced';

-- CreateTable
CREATE TABLE "CloudStorage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "storageType" "StorageType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "s3Region" TEXT,
    "s3Bucket" TEXT,
    "s3AccessKeyId" TEXT,
    "s3SecretAccessKey" TEXT,
    "s3Endpoint" TEXT,
    "s3EncryptedCredentials" TEXT,
    "gdRefreshToken" TEXT,
    "gdFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudStorage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "BackupJob" ADD COLUMN "cloudStorageId" INTEGER;

-- AddForeignKey
ALTER TABLE "CloudStorage" ADD CONSTRAINT "CloudStorage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_cloudStorageId_fkey" FOREIGN KEY ("cloudStorageId") REFERENCES "CloudStorage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

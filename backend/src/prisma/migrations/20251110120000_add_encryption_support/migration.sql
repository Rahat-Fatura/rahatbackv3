-- AlterTable
ALTER TABLE "BackupJob" ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "encryptionPasswordHash" TEXT;

-- AlterTable
ALTER TABLE "BackupHistory" ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false;

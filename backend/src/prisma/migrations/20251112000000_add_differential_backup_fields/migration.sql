-- AlterTable: Add differential backup tracking to BackupJob
ALTER TABLE "BackupJob" ADD COLUMN "lastDifferentialBackupAt" TIMESTAMP(3);

-- AlterTable: Add backup verification fields to BackupHistory
ALTER TABLE "BackupHistory" ADD COLUMN "checksum" TEXT;
ALTER TABLE "BackupHistory" ADD COLUMN "verificationStatus" TEXT;
ALTER TABLE "BackupHistory" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "BackupHistory" ADD COLUMN "canBeRestored" BOOLEAN NOT NULL DEFAULT false;

-- Update existing BackupHistory records to set canBeRestored=true for successful full backups
UPDATE "BackupHistory"
SET "canBeRestored" = true
WHERE "status" = 'success' AND "backupType" = 'full';

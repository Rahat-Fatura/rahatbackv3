-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('full', 'incremental', 'differential');

-- AlterTable BackupJob - Add backup type and tracking fields
ALTER TABLE "BackupJob" ADD COLUMN "backupType" "BackupType" NOT NULL DEFAULT 'full';
ALTER TABLE "BackupJob" ADD COLUMN "lastFullBackupAt" TIMESTAMP(3);

-- AlterTable BackupHistory - Add backup type and base backup reference
ALTER TABLE "BackupHistory" ADD COLUMN "backupType" "BackupType" NOT NULL DEFAULT 'full';
ALTER TABLE "BackupHistory" ADD COLUMN "baseBackupId" INTEGER;

-- CreateIndex
CREATE INDEX "BackupHistory_backupType_idx" ON "BackupHistory"("backupType");
CREATE INDEX "BackupHistory_baseBackupId_idx" ON "BackupHistory"("baseBackupId");

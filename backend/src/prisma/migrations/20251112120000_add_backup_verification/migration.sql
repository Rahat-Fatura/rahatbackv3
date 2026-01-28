-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('BASIC', 'DATABASE', 'FULL');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BACKUP_VERIFY';

-- AlterTable: BackupHistory - Drop old verification fields
ALTER TABLE "BackupHistory" DROP COLUMN IF EXISTS "checksum";
ALTER TABLE "BackupHistory" DROP COLUMN IF EXISTS "verificationStatus";
ALTER TABLE "BackupHistory" DROP COLUMN IF EXISTS "verifiedAt";
ALTER TABLE "BackupHistory" DROP COLUMN IF EXISTS "canBeRestored";

-- AlterTable: BackupHistory - Add new verification fields
ALTER TABLE "BackupHistory" ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BackupHistory" ADD COLUMN "verificationStatus" "VerificationStatus";
ALTER TABLE "BackupHistory" ADD COLUMN "verificationMethod" TEXT;
ALTER TABLE "BackupHistory" ADD COLUMN "verificationError" TEXT;
ALTER TABLE "BackupHistory" ADD COLUMN "verificationCompletedAt" TIMESTAMP(3);
ALTER TABLE "BackupHistory" ADD COLUMN "checksumAlgorithm" TEXT;
ALTER TABLE "BackupHistory" ADD COLUMN "checksumValue" TEXT;
ALTER TABLE "BackupHistory" ADD COLUMN "testRestoreAttempted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BackupHistory" ADD COLUMN "testRestoreSuccess" BOOLEAN;
ALTER TABLE "BackupHistory" ADD COLUMN "testRestoreDuration" INTEGER;
ALTER TABLE "BackupHistory" ADD COLUMN "testRestoreLog" TEXT;

-- AlterTable: BackupJob - Add verification settings
ALTER TABLE "BackupJob" ADD COLUMN "autoVerifyAfterBackup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BackupJob" ADD COLUMN "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'BASIC';
ALTER TABLE "BackupJob" ADD COLUMN "performTestRestore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BackupJob" ADD COLUMN "testRestoreSchedule" TEXT;

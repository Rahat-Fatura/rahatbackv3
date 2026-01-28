-- CreateEnum
CREATE TYPE "RestoreStatus" AS ENUM ('running', 'success', 'failed');

-- AlterTable
ALTER TABLE "BackupHistory" ADD COLUMN     "lastRestoreCompletedAt" TIMESTAMP(3),
ADD COLUMN     "lastRestoreDuration" INTEGER,
ADD COLUMN     "lastRestoreError" TEXT,
ADD COLUMN     "lastRestoreStartedAt" TIMESTAMP(3),
ADD COLUMN     "lastRestoreStatus" "RestoreStatus";

-- CreateTable
CREATE TABLE "RestoreHistory" (
    "id" SERIAL NOT NULL,
    "backupHistoryId" INTEGER NOT NULL,
    "status" "RestoreStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "errorMessage" TEXT,
    "restoredBy" INTEGER,
    "databaseName" TEXT,

    CONSTRAINT "RestoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestoreHistory_backupHistoryId_idx" ON "RestoreHistory"("backupHistoryId");

-- CreateIndex
CREATE INDEX "RestoreHistory_status_idx" ON "RestoreHistory"("status");

-- CreateIndex
CREATE INDEX "RestoreHistory_startedAt_idx" ON "RestoreHistory"("startedAt");

-- CreateIndex
CREATE INDEX "BackupHistory_lastRestoreStatus_idx" ON "BackupHistory"("lastRestoreStatus");

-- AddForeignKey
ALTER TABLE "RestoreHistory" ADD CONSTRAINT "RestoreHistory_backupHistoryId_fkey" FOREIGN KEY ("backupHistoryId") REFERENCES "BackupHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

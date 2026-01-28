-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'AGENT_REGISTER';
ALTER TYPE "AuditAction" ADD VALUE 'AGENT_CONNECT';
ALTER TYPE "AuditAction" ADD VALUE 'AGENT_DISCONNECT';
ALTER TYPE "AuditAction" ADD VALUE 'AGENT_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'AGENT_UPDATE';

-- DropIndex
DROP INDEX "Token_token_key";

-- AlterTable
ALTER TABLE "BackupHistory" ADD COLUMN     "encryptionPasswordHash" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "Database" ADD COLUMN     "agentId" INTEGER;

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailySummaryTime" TEXT NOT NULL DEFAULT '09:00',
    "recipientEmail" TEXT,
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "agentId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastSeen" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentId_key" ON "Agent"("agentId");

-- CreateIndex
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "Agent_agentId_idx" ON "Agent"("agentId");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Database_agentId_idx" ON "Database"("agentId");

-- AddForeignKey
ALTER TABLE "Database" ADD CONSTRAINT "Database_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

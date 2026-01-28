-- CreateEnum
CREATE TYPE "DatabaseType" AS ENUM ('postgresql', 'mysql', 'mongodb', 'mssql', 'mariadb', 'sqlite');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('manual', 'hourly', 'daily', 'weekly', 'monthly', 'custom');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('local', 's3', 'ftp', 'azure');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('running', 'success', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Database" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DatabaseType" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "database" TEXT NOT NULL,
    "connectionString" TEXT,
    "sslEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Database_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupJob" (
    "id" SERIAL NOT NULL,
    "databaseId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL,
    "cronExpression" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "storageType" "StorageType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "compression" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupHistory" (
    "id" SERIAL NOT NULL,
    "backupJobId" INTEGER,
    "databaseId" INTEGER NOT NULL,
    "status" "BackupStatus" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT,
    "filePath" TEXT NOT NULL,
    "duration" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BackupHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Database" ADD CONSTRAINT "Database_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupHistory" ADD CONSTRAINT "BackupHistory_backupJobId_fkey" FOREIGN KEY ("backupJobId") REFERENCES "BackupJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupHistory" ADD CONSTRAINT "BackupHistory_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;

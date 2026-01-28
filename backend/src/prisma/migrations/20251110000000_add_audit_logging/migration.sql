-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'LOGIN', 'LOGOUT', 'REGISTER', 'PASSWORD_RESET', 'PASSWORD_CHANGE',
  'TWO_FACTOR_ENABLE', 'TWO_FACTOR_DISABLE',
  'DATABASE_CREATE', 'DATABASE_UPDATE', 'DATABASE_DELETE', 'DATABASE_TEST',
  'BACKUP_JOB_CREATE', 'BACKUP_JOB_UPDATE', 'BACKUP_JOB_DELETE', 'BACKUP_JOB_RUN',
  'BACKUP_START', 'BACKUP_SUCCESS', 'BACKUP_FAIL', 'BACKUP_DELETE',
  'BACKUP_DOWNLOAD', 'BACKUP_RESTORE',
  'CLOUD_STORAGE_CREATE', 'CLOUD_STORAGE_UPDATE', 'CLOUD_STORAGE_DELETE', 'CLOUD_STORAGE_TEST',
  'NOTIFICATION_UPDATE', 'NOTIFICATION_TEST',
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  'SETTINGS_UPDATE'
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT,
    "resourceId" INTEGER,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add advancedScheduleConfig column to BackupJob table
ALTER TABLE "BackupJob" ADD COLUMN IF NOT EXISTS "advancedScheduleConfig" TEXT;

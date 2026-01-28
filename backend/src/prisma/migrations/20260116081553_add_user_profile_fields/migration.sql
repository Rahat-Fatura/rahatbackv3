-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "language" TEXT DEFAULT 'tr',
ADD COLUMN     "phone" TEXT;

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const backupJobModel = {
  create: async (data) => {
    return prisma.backupJob.create({
      data,
      include: {
        database: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
  },

  findById: async (id) => {
    return prisma.backupJob.findUnique({
      where: { id },
      include: {
        database: true,
        BackupHistory: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    });
  },

  findByDatabaseId: async (databaseId) => {
    return prisma.backupJob.findMany({
      where: { databaseId },
      orderBy: { createdAt: 'desc' },
    });
  },

  findByUserId: async (userId, filters = {}) => {
    const where = {
      database: {
        userId,
      },
    };

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.scheduleType) {
      where.scheduleType = filters.scheduleType;
    }

    const jobs = await prisma.backupJob.findMany({
      where,
      include: {
        database: {
          select: {
            id: true,
            name: true,
            type: true,
            host: true,
          },
        },
        BackupHistory: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Convert BigInt to string for JSON serialization
    return jobs.map((job) => ({
      ...job,
      BackupHistory: job.BackupHistory.map((history) => ({
        ...history,
        fileSize: history.fileSize ? history.fileSize.toString() : null,
      })),
    }));
  },

  findActiveJobs: async () => {
    return prisma.backupJob.findMany({
      where: {
        isActive: true,
        scheduleType: { not: 'manual' },
      },
      include: {
        database: true,
      },
    });
  },

  update: async (id, data) => {
    return prisma.backupJob.update({
      where: { id },
      data,
    });
  },

  delete: async (id) => {
    return prisma.backupJob.delete({
      where: { id },
    });
  },

  updateLastRun: async (id, nextRunAt = null) => {
    return prisma.backupJob.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        nextRunAt,
      },
    });
  },
};

module.exports = backupJobModel;

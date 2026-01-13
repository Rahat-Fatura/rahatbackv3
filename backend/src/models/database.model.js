const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const databaseModel = {
  create: async (data) => {
    return prisma.database.create({ data });
  },

  findById: async (id) => {
    return prisma.database.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        BackupJob: true,
        BackupHistory: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    });
  },

  findByUserId: async (userId, filters = {}) => {
    const where = { userId };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return prisma.database.findMany({
      where,
      include: {
        BackupJob: {
          select: {
            id: true,
            name: true,
            isActive: true,
            lastRunAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  update: async (id, data) => {
    return prisma.database.update({
      where: { id },
      data,
    });
  },

  delete: async (id) => {
    return prisma.database.delete({
      where: { id },
    });
  },

  updateLastTested: async (id) => {
    return prisma.database.update({
      where: { id },
      data: { lastTestedAt: new Date() },
    });
  },
};

module.exports = databaseModel;

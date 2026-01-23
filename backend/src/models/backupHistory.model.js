const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const backupHistoryModel = {
  create: async (data) => {
    // Remove id field if it exists to prevent unique constraint errors
    const { id, ...createData } = data;

    return prisma.backupHistory.create({
      data: createData,
      include: {
        database: {
          select: {
            id: true,
            name: true,
            database: true,
            type: true,
          },
        },
        backupJob: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  findById: async (id) => {
    return prisma.backupHistory.findUnique({
      where: { id },
      include: {
        database: true,
        backupJob: true,
      },
    });
  },

  findByJobId: async (backupJobId, limit = 50) => {
    return prisma.backupHistory.findMany({
      where: { backupJobId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  },

  findByDatabaseId: async (databaseId, limit = 50) => {
    return prisma.backupHistory.findMany({
      where: { databaseId },
      include: {
        backupJob: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  },

  findByUserId: async (userId, filters = {}) => {
    // Auto-fail backups that have been "running" for more than 3 hours
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await prisma.backupHistory.updateMany({
      where: {
        database: { userId },
        status: 'running',
        startedAt: { lt: threeHoursAgo },
      },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    });

    const where = {
      database: {
        userId,
      },
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.databaseId) {
      where.databaseId = filters.databaseId;
    }

    if (filters.backupJobId) {
      where.backupJobId = filters.backupJobId;
    }

    const { page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      prisma.backupHistory.findMany({
        where,
        include: {
          database: {
            select: {
              id: true,
              name: true,
              database: true,
              type: true,
            },
          },
          backupJob: {
            select: {
              id: true,
              name: true,
            },
          },
          restoreHistory: {
            orderBy: { startedAt: 'desc' },
            take: 10, // Get last 10 restore attempts for expandable row
          },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.backupHistory.count({ where }),
    ]);

    // Convert BigInt to string for JSON serialization
    const serializedResults = results.map((history) => ({
      ...history,
      fileSize: history.fileSize ? history.fileSize.toString() : null,
    }));

    return {
      results: serializedResults,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalResults: total,
    };
  },

  update: async (id, data) => {
    return prisma.backupHistory.update({
      where: { id },
      data,
    });
  },

  delete: async (id) => {
    return prisma.backupHistory.delete({
      where: { id },
    });
  },

  updateStatus: async (id, status, errorMessage = null) => {
    return prisma.backupHistory.update({
      where: { id },
      data: {
        status,
        errorMessage,
        completedAt: new Date(),
      },
    });
  },

  getStats: async (userId) => {
    const [total, successful, failed, totalSize] = await Promise.all([
      prisma.backupHistory.count({
        where: { database: { userId } },
      }),
      prisma.backupHistory.count({
        where: {
          database: { userId },
          status: 'success',
        },
      }),
      prisma.backupHistory.count({
        where: {
          database: { userId },
          status: 'failed',
        },
      }),
      prisma.backupHistory.aggregate({
        where: {
          database: { userId },
          status: 'success',
        },
        _sum: {
          fileSize: true,
        },
      }),
    ]);

    // Get last 7 days trend data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentBackups = await prisma.backupHistory.findMany({
      where: {
        database: { userId },
        startedAt: {
          gte: sevenDaysAgo,
        },
      },
      select: {
        startedAt: true,
        status: true,
        fileSize: true,
      },
      orderBy: {
        startedAt: 'asc',
      },
    });

    // Get database-wise backup count
    const backupsByDatabase = await prisma.backupHistory.groupBy({
      by: ['databaseId'],
      where: {
        database: { userId },
        status: 'success',
      },
      _count: {
        id: true,
      },
    });

    // Enrich with database names
    const databaseCounts = await Promise.all(
      backupsByDatabase.map(async (item) => {
        const db = await prisma.database.findUnique({
          where: { id: item.databaseId },
          select: { name: true },
        });
        return {
          databaseName: db?.name || 'Unknown',
          count: item._count.id,
        };
      })
    );

    // Get recent backups (last 5)
    const recentHistory = await prisma.backupHistory.findMany({
      where: {
        database: { userId },
      },
      include: {
        database: {
          select: {
            id: true,
            name: true,
            database: true,
            type: true,
          },
        },
        backupJob: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: 5,
    });

    // Serialize BigInt in recent history
    const serializedRecentHistory = recentHistory.map((history) => ({
      ...history,
      fileSize: history.fileSize ? history.fileSize.toString() : null,
    }));

    // Process trend data by day
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayBackups = recentBackups.filter(
        (b) => new Date(b.startedAt) >= date && new Date(b.startedAt) < nextDate
      );

      trendData.push({
        date: date.toISOString().split('T')[0],
        total: dayBackups.length,
        successful: dayBackups.filter((b) => b.status === 'success').length,
        failed: dayBackups.filter((b) => b.status === 'failed').length,
      });
    }

    return {
      total,
      successful,
      failed,
      running: total - successful - failed,
      totalSize: totalSize._sum.fileSize ? totalSize._sum.fileSize.toString() : '0',
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      trendData,
      backupsByDatabase: databaseCounts,
      recentBackups: serializedRecentHistory,
    };
  },
};

module.exports = backupHistoryModel;

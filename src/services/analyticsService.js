import prisma from '../config/database.js';

/**
 * ANALYTICS SERVICE
 * - Project usage statistics
 * - User activity tracking
 * - Endpoint performance metrics
 * - Growth and adoption analytics
 */

class AnalyticsService {
  // Get project analytics
  async getProjectAnalytics(projectId, userId, period = '7d') {
    await this.verifyProjectAccess(projectId, userId);

    const dateRange = this.getDateRange(period);
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    // Get basic project info
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            endpoints: true,
            collaborators: true,
            executionLogs: true,
            mockData: true
          }
        }
      }
    });

    // Get execution analytics
    const executionStats = await prisma.executionLog.groupBy({
      by: ['statusCode'],
      where: {
        projectId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      },
      _avg: {
        responseTime: true
      }
    });

    // Get daily execution trends
    const dailyTrends = await this.getDailyExecutionTrends(projectId, startDate, endDate);

    // Get endpoint performance ranking
    const endpointPerformance = await prisma.endpoint.findMany({
      where: {
        projectId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        path: true,
        method: true,
        callCount: true,
        lastCalled: true,
        _count: {
          select: {
            executionLogs: true
          }
        }
      },
      orderBy: { callCount: 'desc' },
      take: 10
    });

    // Get collaborator activity
    const collaboratorActivity = await prisma.executionLog.groupBy({
      by: ['userId'],
      where: {
        projectId,
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        userId: { not: null }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 10
    });

    // Get status code distribution
    const statusDistribution = executionStats.reduce((acc, stat) => {
      const status = Math.floor(stat.statusCode / 100) * 100; // Group by 100s
      acc[status] = (acc[status] || 0) + stat._count.id;
      return acc;
    }, {});

    return {
      project: {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        stats: project._count
      },
      period: {
        start: startDate,
        end: endDate,
        label: period
      },
      executions: {
        total: executionStats.reduce((sum, stat) => sum + stat._count.id, 0),
        averageResponseTime: executionStats.length > 0 ? 
          executionStats.reduce((sum, stat) => sum + (stat._avg.responseTime || 0), 0) / executionStats.length : 0,
        statusDistribution,
        dailyTrends
      },
      topEndpoints: endpointPerformance.map(ep => ({
        id: ep.id,
        name: ep.name,
        path: ep.path,
        method: ep.method,
        calls: ep.callCount,
        lastCalled: ep.lastCalled,
        recentExecutions: ep._count.executionLogs
      })),
      topCollaborators: await this.enrichCollaboratorData(collaboratorActivity),
      performance: {
        uptime: await this.calculateUptime(projectId, startDate, endDate),
        errorRate: await this.calculateErrorRate(projectId, startDate, endDate),
        peakHours: await this.getPeakHours(projectId, startDate, endDate)
      }
    };
  }

  // Get user analytics
  async getUserAnalytics(userId, period = '30d') {
    const dateRange = this.getDateRange(period);
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            projects: true,
            collaborations: true,
            executionLogs: true
          }
        }
      }
    });

    // Get project activity
    const projectActivity = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ]
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            endpoints: true,
            executionLogs: {
              where: {
                createdAt: {
                  gte: startDate,
                  lte: endDate
                }
              }
            }
          }
        }
      },
      orderBy: {
        executionLogs: {
          _count: 'desc'
        }
      },
      take: 10
    });

    // Get daily activity
    const dailyActivity = await prisma.executionLog.groupBy({
      by: ['createdAt'],
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Get AI usage if available
    let aiUsage = null;
    try {
      aiUsage = await prisma.aiUsage.aggregate({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cost: true
        },
        _count: {
          id: true
        }
      });
    } catch (error) {
      // AI usage table might not exist
      console.log('AI usage data not available');
    }

    // Get collaborator activity across projects
    const collaborationStats = await prisma.projectCollaborator.findMany({
      where: { userId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            owner: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        joinedAt: user.createdAt,
        stats: user._count
      },
      period: {
        start: startDate,
        end: endDate,
        label: period
      },
      activity: {
        totalProjects: user._count.projects + user._count.collaborations,
        activeProjects: projectActivity.length,
        totalExecutions: user._count.executionLogs,
        periodExecutions: dailyActivity.reduce((sum, day) => sum + day._count.id, 0),
        dailyActivity: dailyActivity.map(day => ({
          date: day.createdAt.toISOString().split('T')[0],
          count: day._count.id
        }))
      },
      topProjects: projectActivity.map(proj => ({
        id: proj.id,
        name: proj.name,
        endpoints: proj._count.endpoints,
        executions: proj._count.executionLogs
      })),
      collaborations: collaborationStats.map(collab => ({
        projectId: collab.project.id,
        projectName: collab.project.name,
        projectOwner: collab.project.owner.name,
        role: collab.role,
        canEdit: collab.canEdit,
        invitedAt: collab.createdAt
      })),
      aiUsage: aiUsage ? {
        totalRequests: aiUsage._count.id,
        totalTokens: (aiUsage._sum.inputTokens || 0) + (aiUsage._sum.outputTokens || 0),
        totalCost: aiUsage._sum.cost || 0
      } : null,
      trends: {
        projectGrowth: await this.calculateProjectGrowth(userId, startDate, endDate),
        executionGrowth: await this.calculateExecutionGrowth(userId, startDate, endDate)
      }
    };
  }

  // Get endpoint analytics
  async getEndpointAnalytics(endpointId, userId, period = '7d') {
    const endpoint = await prisma.endpoint.findUnique({
      where: { id: endpointId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!endpoint) {
      throw new Error('ENDPOINT_NOT_FOUND');
    }

    // Verify access
    if (endpoint.project.ownerId !== userId && 
        endpoint.project.collaborators.length === 0) {
      throw new Error('ENDPOINT_ACCESS_DENIED');
    }

    const dateRange = this.getDateRange(period);
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    // Get execution logs for this endpoint
    const executionLogs = await prisma.executionLog.findMany({
      where: {
        endpointId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // Calculate statistics
    const totalExecutions = executionLogs.length;
    const successfulExecutions = executionLogs.filter(log => log.statusCode < 400).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    
    const responseTimes = executionLogs
      .map(log => log.responseTime)
      .filter(time => time !== null && time !== undefined);
    
    const avgResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    
    const maxResponseTime = responseTimes.length > 0 ? 
      Math.max(...responseTimes) : 0;
    
    const minResponseTime = responseTimes.length > 0 ? 
      Math.min(...responseTimes) : 0;

    // Group by status code
    const statusCodeGroups = executionLogs.reduce((groups, log) => {
      const code = Math.floor(log.statusCode / 100) * 100; // Group by 100s
      groups[code] = (groups[code] || 0) + 1;
      return groups;
    }, {});

    // Group by hour for peak usage
    const hourlyUsage = executionLogs.reduce((hours, log) => {
      const hour = log.createdAt.getHours();
      hours[hour] = (hours[hour] || 0) + 1;
      return hours;
    }, Array(24).fill(0));

    // Get recent errors
    const recentErrors = executionLogs
      .filter(log => log.statusCode >= 400 || log.error)
      .slice(0, 10)
      .map(log => ({
        id: log.id,
        statusCode: log.statusCode,
        error: log.error,
        responseTime: log.responseTime,
        createdAt: log.createdAt
      }));

    return {
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        path: endpoint.path,
        method: endpoint.method,
        totalCalls: endpoint.callCount,
        lastCalled: endpoint.lastCalled,
        createdAt: endpoint.createdAt
      },
      period: {
        start: startDate,
        end: endDate,
        label: period
      },
      statistics: {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
        averageResponseTime: Math.round(avgResponseTime),
        maxResponseTime: Math.round(maxResponseTime),
        minResponseTime: Math.round(minResponseTime),
        statusCodeDistribution: statusCodeGroups
      },
      performance: {
        hourlyUsage,
        peakHour: hourlyUsage.indexOf(Math.max(...hourlyUsage)),
        recentErrors
      },
      timeline: executionLogs.map(log => ({
        id: log.id,
        statusCode: log.statusCode,
        responseTime: log.responseTime,
        createdAt: log.createdAt
      }))
    };
  }

  // Helper methods
  async verifyProjectAccess(projectId, userId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ]
      }
    });

    if (!project) {
      throw new Error('PROJECT_ACCESS_DENIED');
    }

    return true;
  }

  getDateRange(period) {
    const endDate = new Date();
    let startDate = new Date();

    switch (period) {
      case '1d':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7); // Default to 7 days
    }

    return { start: startDate, end: endDate };
  }

  // FIXED: Using Prisma query builder without empty _sum
  async getDailyExecutionTrends(projectId, startDate, endDate) {
    // Group by day - get total counts and average response times
    const logs = await prisma.executionLog.groupBy({
      by: ['createdAt'],
      where: {
        projectId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      },
      _avg: {
        responseTime: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Get success counts by day
    const successCounts = await prisma.executionLog.groupBy({
      by: ['createdAt'],
      where: {
        projectId,
        statusCode: { lt: 400 },
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      }
    });

    // Get error counts by day  
    const errorCounts = await prisma.executionLog.groupBy({
      by: ['createdAt'],
      where: {
        projectId,
        statusCode: { gte: 400 },
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      }
    });

    // Create maps for quick lookup
    const successMap = new Map();
    const errorMap = new Map();

    // Helper function to extract date key
    const getDateKey = (date) => {
      return date.toISOString().split('T')[0];
    };

    // Populate success map
    successCounts.forEach(item => {
      const dateKey = getDateKey(item.createdAt);
      successMap.set(dateKey, item._count.id);
    });

    // Populate error map
    errorCounts.forEach(item => {
      const dateKey = getDateKey(item.createdAt);
      errorMap.set(dateKey, item._count.id);
    });

    // Format the response
    const trends = logs.map(log => {
      const dateKey = getDateKey(log.createdAt);
      return {
        date: dateKey,
        count: log._count.id,
        avg_response_time: log._avg.responseTime || 0,
        success_count: successMap.get(dateKey) || 0,
        error_count: errorMap.get(dateKey) || 0
      };
    });

    return trends;
  }

  async enrichCollaboratorData(collaboratorActivity) {
    const enriched = [];
    
    for (const stat of collaboratorActivity) {
      const user = await prisma.user.findUnique({
        where: { id: stat.userId },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true
        }
      });

      if (user) {
        enriched.push({
          user,
          executionCount: stat._count.id
        });
      }
    }

    return enriched;
  }

  async calculateUptime(projectId, startDate, endDate) {
    const totalExecutions = await prisma.executionLog.count({
      where: {
        projectId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const successfulExecutions = await prisma.executionLog.count({
      where: {
        projectId,
        statusCode: { lt: 400 },
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    return totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 100;
  }

  async calculateErrorRate(projectId, startDate, endDate) {
    const totalExecutions = await prisma.executionLog.count({
      where: {
        projectId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const errorExecutions = await prisma.executionLog.count({
      where: {
        projectId,
        statusCode: { gte: 400 },
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    return totalExecutions > 0 ? (errorExecutions / totalExecutions) * 100 : 0;
  }

  // FIXED: Using Prisma query builder instead of raw SQL
  async getPeakHours(projectId, startDate, endDate) {
    // Get all logs in the period
    const logs = await prisma.executionLog.findMany({
      where: {
        projectId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        createdAt: true,
        responseTime: true
      }
    });

    // Group by hour manually
    const hourlyStats = {};
    logs.forEach(log => {
      const hour = log.createdAt.getHours();
      if (!hourlyStats[hour]) {
        hourlyStats[hour] = {
          count: 0,
          totalResponseTime: 0
        };
      }
      hourlyStats[hour].count++;
      hourlyStats[hour].totalResponseTime += log.responseTime || 0;
    });

    // Format and sort
    const formattedStats = Object.entries(hourlyStats).map(([hour, stats]) => ({
      hour: parseInt(hour),
      count: stats.count,
      avg_response_time: stats.count > 0 ? stats.totalResponseTime / stats.count : 0
    }));

    // Sort by count descending and take top 5
    formattedStats.sort((a, b) => b.count - a.count);
    
    return formattedStats.slice(0, 5);
  }

  async calculateProjectGrowth(userId, startDate, endDate) {
    const projectsAtStart = await prisma.project.count({
      where: {
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ],
        createdAt: { lt: startDate }
      }
    });

    const projectsAtEnd = await prisma.project.count({
      where: {
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ],
        createdAt: { lte: endDate }
      }
    });

    return {
      start: projectsAtStart,
      end: projectsAtEnd,
      growth: projectsAtStart > 0 ? 
        ((projectsAtEnd - projectsAtStart) / projectsAtStart) * 100 : 
        projectsAtEnd > 0 ? 100 : 0
    };
  }

  async calculateExecutionGrowth(userId, startDate, endDate) {
    const periodStart = startDate;
    const periodEnd = endDate;
    const previousStart = new Date(startDate);
    const periodDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    previousStart.setDate(previousStart.getDate() - periodDays);

    const currentPeriod = await prisma.executionLog.count({
      where: {
        userId,
        createdAt: {
          gte: periodStart,
          lte: periodEnd
        }
      }
    });

    const previousPeriod = await prisma.executionLog.count({
      where: {
        userId,
        createdAt: {
          gte: previousStart,
          lt: periodStart
        }
      }
    });

    return {
      current: currentPeriod,
      previous: previousPeriod,
      growth: previousPeriod > 0 ? 
        ((currentPeriod - previousPeriod) / previousPeriod) * 100 : 
        currentPeriod > 0 ? 100 : 0
    };
  }
}

export default new AnalyticsService();
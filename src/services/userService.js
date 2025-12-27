import prisma from '../config/database.js';

class UserService {
  // Get user profile
  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            projects: true,
            collaborations: true
          }
        }
      }
    });

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    return user;
  }

  // Update user profile
  async updateProfile(userId, updateData) {
    const { name, avatar } = updateData;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(avatar && { avatar })
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        updatedAt: true
      }
    });

    return user;
  }

  // Update email
  async updateEmail(userId, newEmail) {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail }
    });

    if (existingUser) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail,
        emailVerified: false // Require re-verification
      },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true
      }
    });

    return user;
  }

  // Delete user account
  async deleteAccount(userId) {
    // Using transaction to ensure all user data is deleted
    return await prisma.$transaction(async (tx) => {
      // Delete user's projects and all related data (cascade)
      await tx.project.deleteMany({
        where: { ownerId: userId }
      });

      // Remove user from collaborations
      await tx.projectCollaborator.deleteMany({
        where: { userId: userId }
      });

      // Delete API keys
      await tx.apiKey.deleteMany({
        where: { userId: userId }
      });

      // Delete sessions
      await tx.session.deleteMany({
        where: { userId: userId }
      });

      // Delete AI usage records
      await tx.aiUsage.deleteMany({
        where: { userId: userId }
      });

      // Finally delete user
      await tx.user.delete({
        where: { id: userId }
      });

      return { success: true };
    });
  }

  // Get user statistics
  async getUserStats(userId) {
    const stats = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        _count: {
          select: {
            projects: true,
            collaborations: true
          }
        },
        projects: {
          select: {
            _count: {
              select: {
                endpoints: true,
                mockData: true
              }
            }
          }
        }
      }
    });

    if (!stats) {
      throw new Error('USER_NOT_FOUND');
    }

    const totalEndpoints = stats.projects.reduce(
      (sum, project) => sum + project._count.endpoints, 0
    );

    const totalMockData = stats.projects.reduce(
      (sum, project) => sum + project._count.mockData, 0
    );

    return {
      projects: stats._count.projects,
      collaborations: stats._count.collaborations,
      endpoints: totalEndpoints,
      mockData: totalMockData
    };
  }

  // Search users for collaboration
  async searchUsers(query, excludeUserId) {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } }
            ]
          },
          { id: { not: excludeUserId } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true
      },
      take: 10
    });

    return users;
  }

  // Verify email
  async verifyEmail(token) {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token
      }
    });

    if (!user) {
      throw new Error('INVALID_VERIFICATION_TOKEN');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null
      }
    });

    return { success: true };
  }
}

export default new UserService();
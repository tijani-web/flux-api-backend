import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database.js';

class ProjectService {
  // Create new project
  async createProject(userId, projectData) {
    const { name, description, visibility } = projectData;
    
    const project = await prisma.project.create({
      data: {
        name,
        description,
        visibility: visibility || 'PRIVATE',
        slug: this.generateSlug(name),
        ownerId: userId
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        _count: {
          select: {
            endpoints: true,
            collaborators: true
          }
        }
      }
    });

    return project;
  }

  // Get user's projects
  async getUserProjects(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { collaborators: { some: { userId: userId } } }
          ]
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          },
          _count: {
            select: {
              endpoints: true,
              collaborators: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.project.count({
        where: {
          OR: [
            { ownerId: userId },
            { collaborators: { some: { userId: userId } } }
          ]
        }
      })
    ]);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get project by ID with access control
  async getProject(projectId, userId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } },
          { visibility: 'PUBLIC' }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          }
        },
        endpoints: {
          orderBy: { createdAt: 'asc' }
        },
        mockData: true,
        environments: true,
        _count: {
          select: {
            endpoints: true,
            collaborators: true
          }
        }
      }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND');
    }

    return project;
  }

  // Update project
  async updateProject(projectId, userId, updateData) {
    // Verify user has access to update
    const project = await this.verifyProjectAccess(projectId, userId, ['owner', 'admin']);

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...updateData,
        ...(updateData.name && { slug: this.generateSlug(updateData.name) })
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        _count: {
          select: {
            endpoints: true,
            collaborators: true
          }
        }
      }
    });

    return updatedProject;
  }

  // Delete project
  async deleteProject(projectId, userId) {
    // Verify user is owner
    const project = await this.verifyProjectAccess(projectId, userId, ['owner']);

    await prisma.project.delete({
      where: { id: projectId }
    });

    return { success: true };
  }

  // Add collaborator
  async addCollaborator(projectId, ownerId, collaboratorData) {
    const { userId, role, canEdit, canInvite } = collaboratorData;

    // Verify owner is adding collaborator
    await this.verifyProjectAccess(projectId, ownerId, ['owner']);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Check if already collaborator
    const existingCollaborator = await prisma.projectCollaborator.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (existingCollaborator) {
      throw new Error('USER_ALREADY_COLLABORATOR');
    }

    const collaborator = await prisma.projectCollaborator.create({
      data: {
        projectId,
        userId,
        role: role || 'EDITOR',
        canEdit: canEdit !== undefined ? canEdit : true,
        canInvite: canInvite || false,
        invitedBy: ownerId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });

    return collaborator;
  }

  // Remove collaborator
  async removeCollaborator(projectId, ownerId, collaboratorId) {
    // Verify owner is removing collaborator
    await this.verifyProjectAccess(projectId, ownerId, ['owner']);

    await prisma.projectCollaborator.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: collaboratorId
        }
      }
    });

    return { success: true };
  }

  // Update collaborator role
  async updateCollaborator(projectId, ownerId, collaboratorId, updateData) {
    // Verify owner is updating collaborator
    await this.verifyProjectAccess(projectId, ownerId, ['owner']);

    const collaborator = await prisma.projectCollaborator.update({
      where: {
        projectId_userId: {
          projectId,
          userId: collaboratorId
        }
      },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });

    return collaborator;
  }

  // Verify project access
  async verifyProjectAccess(projectId, userId, requiredRoles = []) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ]
      },
      include: {
        collaborators: {
          where: { userId: userId }
        }
      }
    });

    if (!project) {
      throw new Error('PROJECT_ACCESS_DENIED');
    }

    const userRole = project.ownerId === userId ? 'owner' : 
                    project.collaborators[0]?.role?.toLowerCase();

    if (requiredRoles.length > 0 && !requiredRoles.includes(userRole)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    return project;
  }

  // Generate URL-friendly slug
  generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + 
      '-' + 
      Math.random().toString(36).substr(2, 5);
  }

  // Get project activity (recent executions, updates)
  async getProjectActivity(projectId, userId, limit = 20) {
    await this.verifyProjectAccess(projectId, userId);

    const activity = await prisma.executionLog.findMany({
      where: { projectId },
      include: {
        endpoint: {
          select: {
            id: true,
            name: true,
            path: true,
            method: true
          }
        },
        apiKey: {
          select: {
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return activity;
  }
}

export default new ProjectService();
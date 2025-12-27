// server/services/projectCollaboratorService.js
import prisma from '../config/database.js';
import crypto from 'crypto';
import emailService from './emailService.js';

class ProjectCollaboratorService {
  async getProjectCollaborators(projectId) {
    const collaborators = await prisma.projectCollaborator.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return collaborators;
  }

  // Send invitation to collaborate 
async sendInvitation(projectId, ownerId, email, role = 'EDITOR') {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ownerId: ownerId
    }
  });

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND_OR_NOT_OWNER');
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email }
  });

  // If user exists, check if already a collaborator
  if (user) {
    const existingCollaborator = await prisma.projectCollaborator.findFirst({
      where: {
        projectId,
        userId: user.id
      }
    });

    if (existingCollaborator) {
      throw new Error('USER_ALREADY_COLLABORATOR');
    }

    if (user.id === ownerId) {
      throw new Error('CANNOT_INVITE_OWNER');
    }
  }

  // Check for existing PENDING invitation
  const existingInvitation = await prisma.projectInvitation.findFirst({
    where: {
      projectId,
      email,
      status: 'PENDING'
    }
  });

  let invitation;
  let isResend = false;
  let invitationExpired = false; 

  if (existingInvitation) {
    const isExpired = existingInvitation.expiresAt && 
                     existingInvitation.expiresAt < new Date();
    
    invitationExpired = isExpired; 
    
    if (isExpired) {
      await prisma.projectInvitation.update({
        where: { id: existingInvitation.id },
        data: { status: 'EXPIRED' }
      });
      // Continue to create new invitation below
    } else {
      const newToken = crypto.randomBytes(32).toString('hex');
      
      invitation = await prisma.projectInvitation.update({
        where: { id: existingInvitation.id },
        data: {
          token: newToken,
          role,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          updatedAt: new Date()
        }
      });
      isResend = true;
    }
  }

  if (!existingInvitation || (existingInvitation && invitationExpired)) {
    const token = crypto.randomBytes(32).toString('hex');
    
    invitation = await prisma.projectInvitation.create({
      data: {
        projectId,
        email,
        role,
        token,
        invitedById: ownerId,
        userId: user?.id || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  }

  // Get inviter info
  const inviter = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { name: true }
  });

  // Send email
  try {
    await emailService.sendCollaborationInvite(
      email,
      inviter.name,
      project.name,
      invitation.token
    );
  } catch (emailError) {
    console.error('Failed to send invitation email:', emailError);
  }

  return { 
    success: true, 
    message: isResend ? 'Invitation re-sent successfully' : 'Invitation sent successfully',
    data: { 
      email, 
      role, 
      userExists: !!user,
      resend: isResend,
      expiresAt: invitation.expiresAt
    }
  };
}

  // Accept invitation and become collaborator
  async acceptInvitation(token, userId) {
    // Find invitation
    const invitation = await prisma.projectInvitation.findFirst({
      where: {
        token,
        status: 'PENDING'
      },
      include: {
        project: true
      }
    });

    if (!invitation) {
      throw new Error('INVALID_OR_EXPIRED_INVITATION');
    }

    // Check if user matches invitation email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });

    if (user.email !== invitation.email) {
      throw new Error('EMAIL_MISMATCH');
    }

    // Check if already a collaborator
    const existingCollaborator = await prisma.projectCollaborator.findFirst({
      where: {
        projectId: invitation.projectId,
        userId
      }
    });

    if (existingCollaborator) {
      // Mark invitation as accepted anyway
      await prisma.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', userId }
      });
      throw new Error('ALREADY_COLLABORATOR');
    }

    // Create collaborator
    const collaborator = await prisma.projectCollaborator.create({
      data: {
        projectId: invitation.projectId,
        userId: userId,
        role: invitation.role,
        addedById: invitation.invitedById
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

    // Update invitation status
    await prisma.projectInvitation.update({
      where: { id: invitation.id },
      data: { 
        status: 'ACCEPTED',
        userId
      }
    });

    // Send welcome to project email
    try {
      await emailService.sendWelcomeToProjectEmail(
        user.email,
        user.name,
        invitation.project.name,
        `${process.env.FRONTEND_URL}/projects/${invitation.projectId}`
      );
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    return collaborator;
  }

  // Add collaborator directly (for testing or admin use)
  async addCollaboratorDirect(projectId, ownerId, userId, role = 'EDITOR') {
    // Check if project exists and user is owner
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: ownerId
      }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND_OR_NOT_OWNER');
    }

    // Check if already a collaborator
    const existingCollaborator = await prisma.projectCollaborator.findFirst({
      where: {
        projectId,
        userId
      }
    });

    if (existingCollaborator) {
      throw new Error('USER_ALREADY_COLLABORATOR');
    }

    // Check if trying to add owner
    if (userId === ownerId) {
      throw new Error('CANNOT_ADD_OWNER_AS_COLLABORATOR');
    }

    // Add collaborator directly
    const collaborator = await prisma.projectCollaborator.create({
      data: {
        projectId,
        userId,
        role,
        addedById: ownerId
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

    // Get user info for email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });

    // Send welcome email
    try {
      await emailService.sendWelcomeToProjectEmail(
        user.email,
        user.name,
        project.name,
        `${process.env.FRONTEND_URL}/projects/${projectId}`
      );
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    return collaborator;
  }

  // Remove collaborator from project
  async removeCollaborator(projectId, ownerId, userId) {
    // Check if project exists and user is owner
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: ownerId
      }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND_OR_NOT_OWNER');
    }

    // Check if trying to remove owner
    if (userId === ownerId) {
      throw new Error('CANNOT_REMOVE_OWNER');
    }

    // Remove collaborator
    const deleted = await prisma.projectCollaborator.deleteMany({
      where: {
        projectId,
        userId
      }
    });

    if (deleted.count === 0) {
      throw new Error('COLLABORATOR_NOT_FOUND');
    }

    return { success: true };
  }

  // Update collaborator role
  async updateCollaborator(projectId, ownerId, userId, role) {
    // Check if project exists and user is owner
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: ownerId
      }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND_OR_NOT_OWNER');
    }

    // Check valid role
    const validRoles = ['VIEWER', 'EDITOR', 'ADMIN'];
    if (!validRoles.includes(role)) {
      throw new Error('INVALID_ROLE');
    }

    // Update collaborator
    const updated = await prisma.projectCollaborator.updateMany({
      where: {
        projectId,
        userId
      },
      data: { role }
    });

    if (updated.count === 0) {
      throw new Error('COLLABORATOR_NOT_FOUND');
    }

    // Get updated collaborator
    const collaborator = await prisma.projectCollaborator.findFirst({
      where: {
        projectId,
        userId
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

  // Search users by email or name
  async searchUsers(query, excludeUserId) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } }
        ],
        NOT: { id: excludeUserId }
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

  // Get user's collaboration permissions
  async getUserPermissions(projectId, userId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId },
      select: { ownerId: true }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND');
    }

    // If user is owner
    if (userId === project.ownerId) {
      return {
        isOwner: true,
        canEdit: true,
        canDelete: true,
        canManageCollaborators: true,
        canView: true,
        role: 'OWNER'
      };
    }

    // Check if user is collaborator
    const collaborator = await prisma.projectCollaborator.findFirst({
      where: {
        projectId,
        userId
      }
    });

    if (!collaborator) {
      return {
        isOwner: false,
        canEdit: false,
        canDelete: false,
        canManageCollaborators: false,
        canView: false,
        role: null
      };
    }

    // Return permissions based on role
    const rolePermissions = {
      VIEWER: {
        canEdit: false,
        canDelete: false,
        canManageCollaborators: false,
        canView: true
      },
      EDITOR: {
        canEdit: true,
        canDelete: false,
        canManageCollaborators: false,
        canView: true
      },
      ADMIN: {
        canEdit: true,
        canDelete: true,
        canManageCollaborators: true,
        canView: true
      }
    };

    return {
      isOwner: false,
      ...rolePermissions[collaborator.role],
      role: collaborator.role
    };
  }

  // Get pending invitations for a project
async getPendingInvitations(projectId, currentUserId) {
  console.log('🔍 getPendingInvitations called with:', { projectId, currentUserId });
  
  const isProjectOwner = await prisma.project.findFirst({
    where: {
      id: projectId,
      ownerId: currentUserId
    }
  });
  
  console.log('✅ Is project owner?', isProjectOwner);
  
  const whereClause = {
    projectId,
    status: 'PENDING'
  };
  
  if (!isProjectOwner) {
    whereClause.invitedById = currentUserId;
  }
  
  console.log('🔎 Querying with:', whereClause);
  
  const invitations = await prisma.projectInvitation.findMany({
    where: whereClause,
    include: {
      invitedBy: {
        select: { name: true, email: true }
      },
      user: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('📨 Found invitations:', invitations.length);
  console.log('📄 Invitations:', invitations);
  
  return invitations;
}

  // Cancel/revoke invitation
  async cancelInvitation(invitationId, ownerId) {
    const invitation = await prisma.projectInvitation.findFirst({
      where: {
        id: invitationId,
        invitedById: ownerId,
        status: 'PENDING'
      }
    });

    if (!invitation) {
      throw new Error('INVITATION_NOT_FOUND_OR_ALREADY_PROCESSED');
    }

    await prisma.projectInvitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' }
    });

    return { success: true };
  }
}

export default new ProjectCollaboratorService();
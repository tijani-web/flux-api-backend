import { param, validationResult } from 'express-validator';
import prisma from '../config/database.js';

/**
 * PRODUCTION COLLABORATION SECURITY MIDDLEWARE
 * - Project access validation
 * - Real-time session management
 * - Permission checks for collaborative editing
 */

// Validate project access and permissions
export const validateProjectAccess = [
  param('projectId')
    .notEmpty()
    .withMessage('Project ID is required'),

  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PROJECT_ID',
          message: 'Invalid project identifier'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Authentication required for project access'
        });
      }

      const projectId = req.params.projectId;

      // Check if user has access to project
      const projectAccess = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { ownerId: req.user.id },
            { 
              collaborators: {
                some: {
                  userId: req.user.id,
  
                }
              }
            }
          ]
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          visibility: true,
          collaborators: {
            where: { userId: req.user.id },
            select: { role: true, canEdit: true, canInvite: true }
          }
        }
      });

      if (!projectAccess) {
        return res.status(403).json({
          success: false,
          error: 'PROJECT_ACCESS_DENIED',
          message: 'You do not have access to this project'
        });
      }

      // Set project context and permissions
      req.project = {
        id: projectAccess.id,
        name: projectAccess.name,
        isOwner: projectAccess.ownerId === req.user.id,
        userRole: projectAccess.collaborators[0]?.role || 'VIEWER',
        permissions: getCollaborationPermissions(projectAccess, req.user.id)
      };

      next();

    } catch (error) {
      console.error('Project access validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'PROJECT_VALIDATION_ERROR',
        message: 'Failed to validate project access'
      });
    }
  }
];

// Check if user can edit project
export const requireEditPermission = (req, res, next) => {
  if (!req.project) {
    return res.status(403).json({
      success: false,
      error: 'PROJECT_CONTEXT_REQUIRED',
      message: 'Project context not found'
    });
  }

  const canEdit = req.project.isOwner || 
                 req.project.permissions.includes('edit') ||
                 req.project.userRole === 'EDITOR' || 
                 req.project.userRole === 'ADMIN';

  if (!canEdit) {
    return res.status(403).json({
      success: false,
      error: 'EDIT_PERMISSION_REQUIRED',
      message: 'You do not have permission to edit this project'
    });
  }

  next();
};

// Check if user can invite collaborators
export const requireInvitePermission = (req, res, next) => {
  if (!req.project) {
    return res.status(403).json({
      success: false,
      error: 'PROJECT_CONTEXT_REQUIRED',
      message: 'Project context not found'
    });
  }

  const canInvite = req.project.isOwner || 
                   req.project.permissions.includes('invite') ||
                   req.project.userRole === 'ADMIN';

  if (!canInvite) {
    return res.status(403).json({
      success: false,
      error: 'INVITE_PERMISSION_REQUIRED',
      message: 'You do not have permission to invite collaborators'
    });
  }

  next();
};

// WebSocket connection validation for real-time collaboration
export const validateWebSocketConnection = async (socket, next) => {
  try {
    const { projectId, token } = socket.handshake.auth;

    if (!projectId || !token) {
      return next(new Error('Missing project ID or authentication token'));
    }

    // Verify JWT token
    const jwt = await import('jsonwebtoken');
    const env = await import('../config/env.js');
    
    const decoded = jwt.verify(token, env.jwt.secret);
    
    // Check project access (similar to HTTP middleware)
    const projectAccess = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: decoded.userId },
          { 
            collaborators: {
              some: { userId: decoded.userId }
            }
          }
        ]
      }
    });

    if (!projectAccess) {
      return next(new Error('Project access denied'));
    }

    // Attach user and project info to socket
    socket.userId = decoded.userId;
    socket.projectId = projectId;
    
    next();

  } catch (error) {
    console.error('WebSocket auth error:', error);
    next(new Error('Authentication failed'));
  }
};

// Real-time editing conflict prevention
export const preventEditConflicts = (req, res, next) => {
  // This would integrate with your real-time collaboration service
  // to prevent multiple users editing the same endpoint simultaneously
  
  const { endpointId } = req.params;
  const userId = req.user.id;
  
  // Check if endpoint is being edited by someone else
  // const isLocked = collaborationService.isEndpointLocked(endpointId, userId);
  
  // if (isLocked) {
  //   return res.status(409).json({
  //     success: false,
  //     error: 'ENDPOINT_LOCKED',
  //     message: 'This endpoint is currently being edited by another user',
  //     lockedBy: isLocked.lockedBy
  //   });
  // }

  next();
};

// Utility function to get collaboration permissions
const getCollaborationPermissions = (project, userId) => {
  const permissions = [];
  
  if (project.ownerId === userId) {
    permissions.push('owner', 'edit', 'delete', 'invite', 'transfer');
    return permissions;
  }

  const collaboration = project.collaborators[0];
  if (!collaboration) return permissions;

  if (collaboration.canEdit) permissions.push('edit');
  if (collaboration.canInvite) permissions.push('invite');
  if (collaboration.role === 'ADMIN') permissions.push('admin');

  return permissions;
};

export default {
  validateProjectAccess,
  requireEditPermission,
  requireInvitePermission,
  validateWebSocketConnection,
  preventEditConflicts
};
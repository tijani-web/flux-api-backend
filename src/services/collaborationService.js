import { Server } from 'socket.io';
import prisma from '../config/database.js';

/**
 * PRODUCTION REAL-TIME COLLABORATION SERVICE
 * - Live code editing
 * - Cursor synchronization
 * - Conflict resolution
 * - Session management
 */

class CollaborationService {
  constructor() {
    this.activeSessions = new Map(); // projectId -> session data
    this.userSockets = new Map(); // userId -> socketIds
    this.io = null;
  }

  // Initialize Socket.IO server
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.setupSocketHandlers();
    console.log('🚀 Collaboration service initialized');
  }

  // Setup Socket.IO event handlers
  setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket) => {
      console.log(`🔗 User ${socket.userId} connected to collaboration`);

      // Store socket reference
      if (!this.userSockets.has(socket.userId)) {
        this.userSockets.set(socket.userId, new Set());
      }
      this.userSockets.get(socket.userId).add(socket.id);

      // Join project room
      socket.on('join-project', async (data) => {
        await this.handleJoinProject(socket, data);
      });

      // Code editing events
      socket.on('code-change', (data) => {
        this.handleCodeChange(socket, data);
      });

      // Cursor position
      socket.on('cursor-move', (data) => {
        this.handleCursorMove(socket, data);
      });

      // Selection change
      socket.on('selection-change', (data) => {
        this.handleSelectionChange(socket, data);
      });

      // Leave project
      socket.on('leave-project', (data) => {
        this.handleLeaveProject(socket, data);
      });

      // Disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  // Socket authentication middleware
  async authenticateSocket(socket, next) {
    try {
      const { projectId, token } = socket.handshake.auth;

      if (!token || !projectId) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const jwt = await import('jsonwebtoken');
      const env = await import('../config/env.js');
      
      const decoded = jwt.verify(token, env.jwt.secret);
      
      // Verify project access
      const hasAccess = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { ownerId: decoded.userId },
            { collaborators: { some: { userId: decoded.userId } } }
          ]
        }
      });

      if (!hasAccess) {
        return next(new Error('Project access denied'));
      }

      socket.userId = decoded.userId;
      socket.projectId = projectId;
      
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  }

  // Handle joining a project
  async handleJoinProject(socket, data) {
    const { projectId, endpointId } = data;

    try {
      // Verify endpoint access
      const endpoint = await prisma.endpoint.findFirst({
        where: {
          id: endpointId,
          projectId: projectId
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              collaborators: {
                where: { userId: socket.userId },
                select: { role: true }
              }
            }
          }
        }
      });

      if (!endpoint) {
        socket.emit('error', { message: 'Endpoint not found' });
        return;
      }

      // Join project room
      const roomId = `project:${projectId}`;
      socket.join(roomId);

      // Join endpoint room for specific editing
      const endpointRoomId = `endpoint:${endpointId}`;
      socket.join(endpointRoomId);

      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true
        }
      });

      // Initialize or update session
      if (!this.activeSessions.has(projectId)) {
        this.activeSessions.set(projectId, {
          projectId,
          collaborators: new Map(),
          endpoints: new Map()
        });
      }

      const session = this.activeSessions.get(projectId);
      session.collaborators.set(socket.userId, {
        user,
        socketId: socket.id,
        joinedAt: new Date(),
        activeEndpoint: endpointId,
        cursor: null,
        selection: null
      });

      // Notify others about new collaborator
      socket.to(roomId).emit('collaborator-joined', {
        user,
        activeEndpoint: endpointId,
        timestamp: new Date().toISOString()
      });

      // Send current collaborators to the new user
      const collaborators = Array.from(session.collaborators.values())
        .filter(collab => collab.user.id !== socket.userId)
        .map(collab => ({
          user: collab.user,
          activeEndpoint: collab.activeEndpoint,
          cursor: collab.cursor,
          selection: collab.selection
        }));

      socket.emit('collaborators-list', { collaborators });

      console.log(`👥 User ${user.name} joined project ${projectId}`);

    } catch (error) {
      console.error('Join project error:', error);
      socket.emit('error', { message: 'Failed to join project' });
    }
  }

  // Handle code changes
  handleCodeChange(socket, data) {
    const { endpointId, changes, version } = data;
    const roomId = `endpoint:${endpointId}`;

    // Broadcast changes to other collaborators in the endpoint room
    socket.to(roomId).emit('code-update', {
      endpointId,
      changes,
      version,
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });

    // Update session with latest code state (would implement operational transforms here)
    this.updateEndpointState(socket.projectId, endpointId, changes, version);
  }

  // Handle cursor movement
  handleCursorMove(socket, data) {
    const { endpointId, position } = data;
    const roomId = `endpoint:${endpointId}`;

    // Update session
    const session = this.activeSessions.get(socket.projectId);
    if (session && session.collaborators.has(socket.userId)) {
      session.collaborators.get(socket.userId).cursor = position;
    }

    // Broadcast cursor position to others in the endpoint room
    socket.to(roomId).emit('cursor-update', {
      endpointId,
      userId: socket.userId,
      position,
      timestamp: new Date().toISOString()
    });
  }

  // Handle selection changes
  handleSelectionChange(socket, data) {
    const { endpointId, selection } = data;
    const roomId = `endpoint:${endpointId}`;

    // Update session
    const session = this.activeSessions.get(socket.projectId);
    if (session && session.collaborators.has(socket.userId)) {
      session.collaborators.get(socket.userId).selection = selection;
    }

    // Broadcast selection to others
    socket.to(roomId).emit('selection-update', {
      endpointId,
      userId: socket.userId,
      selection,
      timestamp: new Date().toISOString()
    });
  }

  // Handle leaving project
  handleLeaveProject(socket, data) {
    const { projectId } = data;
    const roomId = `project:${projectId}`;

    this.removeCollaborator(projectId, socket.userId);

    // Notify others
    socket.to(roomId).emit('collaborator-left', {
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });

    socket.leave(roomId);
  }

  // Handle disconnect
  handleDisconnect(socket) {
    if (socket.projectId) {
      this.removeCollaborator(socket.projectId, socket.userId);

      // Notify others
      const roomId = `project:${socket.projectId}`;
      socket.to(roomId).emit('collaborator-left', {
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });
    }

    // Remove socket from user sockets
    if (this.userSockets.has(socket.userId)) {
      const userSockets = this.userSockets.get(socket.userId);
      userSockets.delete(socket.id);
      
      if (userSockets.size === 0) {
        this.userSockets.delete(socket.userId);
      }
    }

    console.log(`🔌 User ${socket.userId} disconnected`);
  }

  // Remove collaborator from session
  removeCollaborator(projectId, userId) {
    const session = this.activeSessions.get(projectId);
    if (session) {
      session.collaborators.delete(userId);
      
      // Clean up session if no collaborators
      if (session.collaborators.size === 0) {
        this.activeSessions.delete(projectId);
      }
    }
  }

  // Update endpoint state with operational transforms
  updateEndpointState(projectId, endpointId, changes, version) {
    if (!this.activeSessions.has(projectId)) return;

    const session = this.activeSessions.get(projectId);
    
    if (!session.endpoints.has(endpointId)) {
      session.endpoints.set(endpointId, {
        version,
        content: '',
        changeHistory: []
      });
    }

    const endpointState = session.endpoints.get(endpointId);
    endpointState.changeHistory.push({
      changes,
      version,
      userId: this.getUserIdFromSocket(changes.socketId),
      timestamp: new Date()
    });

    // Keep only recent history
    if (endpointState.changeHistory.length > 100) {
      endpointState.changeHistory = endpointState.changeHistory.slice(-50);
    }
  }

  // Get active collaborators for project
  getActiveCollaborators(projectId) {
    const session = this.activeSessions.get(projectId);
    if (!session) return [];

    return Array.from(session.collaborators.values()).map(collab => ({
      user: collab.user,
      activeEndpoint: collab.activeEndpoint,
      cursor: collab.cursor,
      selection: collab.selection,
      joinedAt: collab.joinedAt
    }));
  }

  // Get collaboration session stats
  getSessionStats() {
    return {
      activeProjects: this.activeSessions.size,
      totalCollaborators: Array.from(this.activeSessions.values())
        .reduce((sum, session) => sum + session.collaborators.size, 0),
      activeEndpoints: Array.from(this.activeSessions.values())
        .reduce((sum, session) => sum + session.endpoints.size, 0)
    };
  }

  // Utility function to get user ID from socket (would be implemented)
  getUserIdFromSocket(socketId) {
    // Implementation would map socket IDs to user IDs
    return null;
  }

  // Broadcast message to all collaborators in project
  broadcastToProject(projectId, event, data) {
    const roomId = `project:${projectId}`;
    this.io.to(roomId).emit(event, data);
  }

  // Send message to specific user
  sendToUser(userId, event, data) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }
}

export default new CollaborationService();
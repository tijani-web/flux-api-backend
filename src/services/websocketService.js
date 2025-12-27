import { Server } from 'socket.io';
import collaborationService from './collaborationService.js';

/**
 * PRODUCTION WEBSOCKET SERVICE
 * - Real-time communication layer
 * - Connection management
 * - Event broadcasting
 * - Health monitoring
 */

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketIds
    this.roomSubscriptions = new Map(); // roomId -> userIds
  }

  // Initialize WebSocket server
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      // Production optimizations
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e8, // 100MB max payload
      connectTimeout: 45000
    });

    this.setupEventHandlers();
    this.startHealthMonitoring();
    
    console.log('🚀 WebSocket service initialized');
    return this.io;
  }

  // Setup Socket.IO event handlers
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔗 Client connected: ${socket.id}`);

      // Store socket connection
      this.handleConnection(socket);

      // Authentication event
      socket.on('authenticate', (data) => {
        this.handleAuthentication(socket, data);
      });

      // Join room event
      socket.on('join-room', (data) => {
        this.handleJoinRoom(socket, data);
      });

      // Leave room event
      socket.on('leave-room', (data) => {
        this.handleLeaveRoom(socket, data);
      });

      // Custom application events
      socket.on('project-update', (data) => {
        this.handleProjectUpdate(socket, data);
      });

      socket.on('endpoint-change', (data) => {
        this.handleEndpointChange(socket, data);
      });

      socket.on('execution-started', (data) => {
        this.handleExecutionStarted(socket, data);
      });

      socket.on('execution-completed', (data) => {
        this.handleExecutionCompleted(socket, data);
      });

      // Ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Disconnection handling
      socket.on('disconnect', (reason) => {
        this.handleDisconnection(socket, reason);
      });

      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  // Handle new connection
  handleConnection(socket) {
    // Initial connection state
    socket.data = {
      connectedAt: new Date(),
      userId: null,
      authenticated: false,
      rooms: new Set()
    };

    // Set up automatic disconnection for unauthenticated sockets
    setTimeout(() => {
      if (!socket.data.authenticated) {
        socket.emit('error', { message: 'Authentication timeout' });
        socket.disconnect(true);
      }
    }, 30000); // 30 second authentication window
  }

  // Handle user authentication
  async handleAuthentication(socket, data) {
    try {
      const { token, userId } = data;

      if (!token || !userId) {
        throw new Error('Missing authentication data');
      }

      // Verify token (you'd use your JWT verification here)
      // const isValid = await this.verifyToken(token, userId);
      // if (!isValid) {
      //   throw new Error('Invalid token');
      // }

      // Update socket data
      socket.data.userId = userId;
      socket.data.authenticated = true;
      socket.data.authenticatedAt = new Date();

      // Store user connection
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId).add(socket.id);

      // Notify client of successful authentication
      socket.emit('authenticated', {
        userId,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ User ${userId} authenticated on socket ${socket.id}`);

    } catch (error) {
      console.error(`Authentication failed for socket ${socket.id}:`, error);
      socket.emit('authentication-failed', {
        error: error.message
      });
      socket.disconnect(true);
    }
  }

  // Handle joining a room
  async handleJoinRoom(socket, data) {
    if (!socket.data.authenticated) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }

    const { roomId, projectId } = data;

    try {
      // Verify room access (e.g., project membership)
      const hasAccess = await this.verifyRoomAccess(roomId, socket.data.userId, projectId);
      
      if (!hasAccess) {
        socket.emit('error', { message: 'Room access denied' });
        return;
      }

      // Join the room
      socket.join(roomId);
      socket.data.rooms.add(roomId);

      // Update room subscriptions
      if (!this.roomSubscriptions.has(roomId)) {
        this.roomSubscriptions.set(roomId, new Set());
      }
      this.roomSubscriptions.get(roomId).add(socket.data.userId);

      // Notify room of new member
      socket.to(roomId).emit('user-joined', {
        userId: socket.data.userId,
        roomId,
        timestamp: new Date().toISOString()
      });

      // Send current room state to new member
      const roomState = await this.getRoomState(roomId);
      socket.emit('room-state', roomState);

      console.log(`👥 User ${socket.data.userId} joined room ${roomId}`);

    } catch (error) {
      console.error(`Join room failed for socket ${socket.id}:`, error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  // Handle leaving a room
  handleLeaveRoom(socket, data) {
    const { roomId } = data;

    socket.leave(roomId);
    socket.data.rooms.delete(roomId);

    // Update room subscriptions
    if (this.roomSubscriptions.has(roomId)) {
      this.roomSubscriptions.get(roomId).delete(socket.data.userId);
      
      // Clean up empty rooms
      if (this.roomSubscriptions.get(roomId).size === 0) {
        this.roomSubscriptions.delete(roomId);
      }
    }

    // Notify room of departure
    socket.to(roomId).emit('user-left', {
      userId: socket.data.userId,
      roomId,
      timestamp: new Date().toISOString()
    });

    console.log(`👋 User ${socket.data.userId} left room ${roomId}`);
  }

  // Handle project updates
  handleProjectUpdate(socket, data) {
    const { projectId, update } = data;

    // Broadcast to all users in project room
    this.broadcastToRoom(`project:${projectId}`, 'project-updated', {
      projectId,
      update,
      updatedBy: socket.data.userId,
      timestamp: new Date().toISOString()
    });
  }

  // Handle endpoint changes
  handleEndpointChange(socket, data) {
    const { projectId, endpointId, changes } = data;

    // Broadcast to endpoint-specific room
    this.broadcastToRoom(`endpoint:${endpointId}`, 'endpoint-changed', {
      projectId,
      endpointId,
      changes,
      changedBy: socket.data.userId,
      timestamp: new Date().toISOString()
    });
  }

  // Handle execution started
  handleExecutionStarted(socket, data) {
    const { projectId, endpointId, executionId } = data;

    this.broadcastToRoom(`project:${projectId}`, 'execution-started', {
      projectId,
      endpointId,
      executionId,
      startedBy: socket.data.userId,
      timestamp: new Date().toISOString()
    });
  }

  // Handle execution completed
  handleExecutionCompleted(socket, data) {
    const { projectId, endpointId, executionId, result } = data;

    this.broadcastToRoom(`project:${projectId}`, 'execution-completed', {
      projectId,
      endpointId,
      executionId,
      result,
      completedBy: socket.data.userId,
      timestamp: new Date().toISOString()
    });
  }

  // Handle disconnection
  handleDisconnection(socket, reason) {
    console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);

    // Remove from connected users
    if (socket.data.userId && this.connectedUsers.has(socket.data.userId)) {
      const userSockets = this.connectedUsers.get(socket.data.userId);
      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        this.connectedUsers.delete(socket.data.userId);
      }
    }

    // Leave all rooms and notify
    socket.data.rooms.forEach(roomId => {
      socket.to(roomId).emit('user-left', {
        userId: socket.data.userId,
        roomId,
        timestamp: new Date().toISOString(),
        reason: 'disconnected'
      });

      // Update room subscriptions
      if (this.roomSubscriptions.has(roomId)) {
        this.roomSubscriptions.get(roomId).delete(socket.data.userId);
      }
    });

    // Clean up socket data
    socket.data.rooms.clear();
  }

  // Broadcast message to room
  broadcastToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
  }

  // Send message to specific user
  sendToUser(userId, event, data) {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  // Verify room access (simplified - implement based on your auth)
  async verifyRoomAccess(roomId, userId, projectId) {
    // In production, you'd verify the user has access to the project/room
    // This is a simplified implementation
    return true;
  }

  // Get current room state
  async getRoomState(roomId) {
    const sockets = await this.io.in(roomId).fetchSockets();
    const users = [];

    sockets.forEach(socket => {
      if (socket.data.authenticated && socket.data.userId) {
        users.push({
          userId: socket.data.userId,
          connectedAt: socket.data.connectedAt,
          socketId: socket.id
        });
      }
    });

    return {
      roomId,
      userCount: users.length,
      users,
      timestamp: new Date().toISOString()
    };
  }

  // Health monitoring
  startHealthMonitoring() {
    setInterval(() => {
      this.healthCheck();
    }, 30000); // Every 30 seconds
  }

  // Health check
  healthCheck() {
    const stats = {
      timestamp: new Date().toISOString(),
      connectedUsers: this.connectedUsers.size,
      totalConnections: Array.from(this.connectedUsers.values())
        .reduce((sum, sockets) => sum + sockets.size, 0),
      activeRooms: this.roomSubscriptions.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };

    // Log stats periodically
    console.log('📊 WebSocket Health:', stats);

    // Emit to monitoring dashboard if needed
    this.io.emit('websocket-stats', stats);
  }

  // Get service statistics
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalConnections: Array.from(this.connectedUsers.values())
        .reduce((sum, sockets) => sum + sockets.size, 0),
      activeRooms: this.roomSubscriptions.size,
      roomDetails: Array.from(this.roomSubscriptions.entries()).map(([roomId, users]) => ({
        roomId,
        userCount: users.size
      }))
    };
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down WebSocket service...');
    
    // Notify all clients
    this.io.emit('server-shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString()
    });

    // Close all connections
    this.io.close();

    console.log('✅ WebSocket service shut down');
  }
}

export default new WebSocketService();
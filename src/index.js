import './loadEnv.js'
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import prisma from './config/database.js';
import websocketService from './services/websocketService.js';

// Middleware
import logger from './middleware/logger.js';
import errorHandler from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import oauthRoutes from './routes/oauthRoutes.js';
import userRoutes from './routes/userRoutes.js';
import projectRoutes from './routes/projectsRoutes.js';
import endpointRoutes from './routes/endpointsRoutes.js';
import executeRoutes from './routes/executeRoutes.js';
import projectCollaboratorRoutes from './routes/projectCollaboratorRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import collaborationRoutes from './routes/collaborationRoutes.js';
import exportImportRoutes from './routes/exportImportRoutes.js';
import documentationRoutes from './routes/documentationRoutes.js';
import mockDataRoutes from './routes/mockDataRoutes.js';
import environmentRoutes from './routes/environmentRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';




const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: env.app.frontendUrl,
  credentials: true
}));


app.set('trust proxy', 1); 

// Rate Limiting
app.use(apiLimiter);

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(logger);

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'API Flow Studio',
    version: '1.0.0'
  });
});

app.get('/api/execute/health', (req, res) => {
  res.json({
    success: true,  
    data: {        
      status: 'healthy',
      timestamp: new Date().toISOString(),
      total: 0
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/endpoints', endpointRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/projects', projectCollaboratorRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/export-import', exportImportRoutes);
app.use('/api/documentation', documentationRoutes);
app.use('/api/mock-data', mockDataRoutes);
app.use('/api/environments', environmentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: `Route ${req.originalUrl} not found`
  });
});

// Error Handler (MUST be last)
app.use(errorHandler);

// Start Server
const server = app.listen(env.app.port, () => {
  console.log(`🚀 API Flow Studio Server running on port ${env.app.port}`);
  console.log(`📊 Environment: ${env.app.nodeEnv}`);
  console.log(`🌐 Frontend URL: ${env.app.frontendUrl}`);
  console.log(`🔗 Health Check: http://localhost:${env.app.port}/health`);
});

// Initialize WebSocket Service
websocketService.initialize(server);

// Graceful Shutdown
const gracefulShutdown = async () => {
  console.log('\n🛑 Received shutdown signal. Starting graceful shutdown...');
  
  // Close HTTP server
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    // Close database connection
    await prisma.$disconnect();
    console.log('✅ Database connection closed');
    
    // Close WebSocket service
    await websocketService.shutdown();
    
    console.log('🎉 Graceful shutdown completed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;
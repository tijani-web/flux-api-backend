import express from 'express';
import {
  executeEndpoint,
  getExecutionHistory,
  getSandboxHealth
} from '../controllers/executeController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess } from '../middleware/collaborationAuth.js';
import { validateCodeExecution, executionRateLimit } from '../middleware/sandboxSecurity.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Code execution
router.post('/project/:projectId/endpoint/:endpointId', authMiddleware, validateProjectAccess, executeEndpoint);
router.get('/endpoint/:endpointId/history', getExecutionHistory);
router.get('/health', getSandboxHealth);

export default router;
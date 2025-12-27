import express from 'express';
import {
  generateCode,
  optimizeCode,
  debugCode,
  generateTests,
  generateAiDocumentation,
  getAIUsage
} from '../controllers/aiController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// AI features
router.post('/generate-code', generateCode);
router.post('/optimize-code', optimizeCode);
router.post('/debug-code', debugCode);
router.post('/generate-tests', generateTests);
router.post('/ai/generate-documentation', generateAiDocumentation);
router.get('/ai/usage', getAIUsage);

export default router;
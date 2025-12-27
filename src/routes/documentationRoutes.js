import express from 'express';
import {
  generateDocs,
  exportDocs,
  getDocAnalytics
} from '../controllers/documentationController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess } from '../middleware/collaborationAuth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/project/:projectId', validateProjectAccess, generateDocs);
router.post('/project/:projectId/export', validateProjectAccess, exportDocs);
router.get('/project/:projectId/analytics', validateProjectAccess, getDocAnalytics);

export default router;
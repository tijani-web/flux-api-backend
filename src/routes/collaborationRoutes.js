import express from 'express';
import {
  getActiveCollaborators,
  getSessionStats
} from '../controllers/collaborationController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess } from '../middleware/collaborationAuth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/project/:projectId/active', validateProjectAccess, getActiveCollaborators);
router.get('/stats', getSessionStats);

export default router;
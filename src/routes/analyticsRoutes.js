import express from 'express';
import {
  getProjectAnalytics,
  getUserAnalytics,
  getEndpointAnalytics
} from '../controllers/analyticsController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess } from '../middleware/collaborationAuth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/project/:projectId', validateProjectAccess, getProjectAnalytics);
router.get('/user', getUserAnalytics);
router.get('/endpoint/:endpointId', getEndpointAnalytics);

export default router;
import express from 'express';
import {
  createEnvironment,
  getEnvironments,
  updateEnvironment,
  deleteEnvironment
} from '../controllers/environmentController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess, requireEditPermission } from '../middleware/collaborationAuth.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/project/:projectId/environments', validateProjectAccess, requireEditPermission, createEnvironment);
router.get('/project/:projectId/environments', validateProjectAccess, getEnvironments);
router.put('/environments/:environmentId', validateProjectAccess, requireEditPermission, updateEnvironment);
router.delete('/environments/:environmentId', validateProjectAccess, requireEditPermission, deleteEnvironment);

export default router;
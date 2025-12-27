import express from 'express';
import {
  createEndpoint,
  getEndpoints,
  getEndpoint,
  updateEndpoint,
  deleteEndpoint,
  duplicateEndpoint
} from '../controllers/endpointController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateEndpointCreate } from '../middleware/validation.js';
import { validateProjectAccess, requireEditPermission } from '../middleware/collaborationAuth.js';

const router = express.Router();

// All routes require authentication and project access
router.use(authMiddleware);

// Endpoint CRUD
router.post('/:projectId/endpoints', validateProjectAccess, requireEditPermission, validateEndpointCreate, createEndpoint);
router.get('/:projectId/endpoints', validateProjectAccess, getEndpoints);
router.get('/:projectId/endpoints/:endpointId', validateProjectAccess, getEndpoint);
router.put('/:projectId/endpoints/:endpointId', validateProjectAccess, requireEditPermission, updateEndpoint);
router.delete('/:projectId/endpoints/:endpointId', validateProjectAccess, requireEditPermission, deleteEndpoint);
router.post('/:projectId/endpoints/:endpointId/duplicate', validateProjectAccess, requireEditPermission, duplicateEndpoint);

export default router;
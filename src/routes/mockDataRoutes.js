import express from 'express';
import {
  createCollection,
  getCollections,
  updateCollection,
  deleteCollection,
  searchCollection,
  saveFromExecution,
  getSaveHistory,
  rollbackCollection
} from '../controllers/mockDataController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess, requireEditPermission } from '../middleware/collaborationAuth.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/project/:projectId/collections', validateProjectAccess, requireEditPermission, createCollection);
router.get('/project/:projectId/collections', validateProjectAccess, getCollections);
router.put('/collections/:collectionId', validateProjectAccess, requireEditPermission, updateCollection);
router.delete('/collections/:collectionId', validateProjectAccess, requireEditPermission, deleteCollection);
router.get('/collections/:collectionId/search', validateProjectAccess, searchCollection);

//  Save from endpoint execution
router.post('/projects/:projectId/collections/:collectionId/save-from-execution', validateProjectAccess, requireEditPermission, saveFromExecution);

//  Get save history
router.get('/collections/:collectionId/save-history', validateProjectAccess, getSaveHistory);

//  Rollback collection
router.post('/collections/:collectionId/rollback', validateProjectAccess, requireEditPermission, rollbackCollection);

export default router;
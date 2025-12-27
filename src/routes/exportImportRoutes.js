// server/routes/exportImportRoutes.js
import express from 'express';
import {
  exportProject,
  importProject,
  getExportFormats,
  getProjectExports  
} from '../controllers/exportImportController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess } from '../middleware/collaborationAuth.js';

const router = express.Router();

router.use(authMiddleware);

// Existing routes
router.post('/project/:projectId/export', validateProjectAccess, exportProject);
router.post('/import', importProject);
router.get('/formats', getExportFormats);

router.get('/exports', validateProjectAccess, getProjectExports);

export default router;
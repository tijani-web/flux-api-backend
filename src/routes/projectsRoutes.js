import express from 'express';
import multer from 'multer';
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectActivity,
  exportProject,
  importProject,
  getProjectExports,
} from '../controllers/projectController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectCreate } from '../middleware/validation.js';
import { validateProjectAccess } from '../middleware/collaborationAuth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Allow JSON, YAML files
    const allowedTypes = [
      'application/json',
      'application/yaml', 
      'text/yaml',
      'text/plain' // Allow .json files that might be text/plain
    ];
    
    const allowedExtensions = ['.json', '.yaml', '.yml'];
    
    // Check MIME type first
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } 
    // Check file extension as fallback
    else {
      const hasValidExtension = allowedExtensions.some(ext => 
        file.originalname.toLowerCase().endsWith(ext)
      );
      
      if (hasValidExtension) {
        cb(null, true);
      } else {
        cb(new Error('Only JSON (.json) and YAML (.yaml, .yml) files are allowed'), false);
      }
    }
  }
});

// ===== ALL ROUTES REQUIRE AUTHENTICATION =====
router.use(authMiddleware);

// ===== PROJECT CRUD ROUTES =====
router.post('/', validateProjectCreate, createProject);
router.get('/', getProjects);
router.get('/:projectId', validateProjectAccess, getProject);
router.put('/:projectId', validateProjectAccess, updateProject);
router.delete('/:projectId', validateProjectAccess, deleteProject);

// ===== PROJECT ACTIVITY =====
router.get('/:projectId/activity', validateProjectAccess, getProjectActivity);

// ===== EXPORT/IMPORT ROUTES (CORRECTED) =====

// Export project - POST with format options in body
router.post('/:projectId/export', validateProjectAccess, exportProject);

// Import project - file upload with body fields
router.post('/import', upload.single('file'), importProject);

// Get project export history
router.get('/:projectId/exports', validateProjectAccess, getProjectExports);



export default router;
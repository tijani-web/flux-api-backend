// server/routes/projectCollaboratorRoutes.js
import express from 'express';
import {
  getCollaborators,
  sendInvitation,
  removeCollaborator,
  updateCollaborator,
  searchUsers,
  getUserPermissions,
  acceptInvitation,
  getPendingInvitations,
  addCollaboratorDirect
} from '../controllers/projectCollaboratorController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

// Main routes (these are what SettingsSection calls)
router.get('/:projectId/collaborators', getCollaborators);
router.post('/:projectId/collaborators', sendInvitation); 
router.delete('/:projectId/collaborators/:userId', removeCollaborator);
router.patch('/:projectId/collaborators/:userId', updateCollaborator);
router.get('/:projectId/permissions', getUserPermissions);

// User search for adding collaborators
router.get('/search/users', searchUsers);

// Invitation management
router.post('/invitations/accept', acceptInvitation);
router.get('/:projectId/invitations/pending', getPendingInvitations);

// Admin direct add (optional)
router.post('/:projectId/collaborators/direct', addCollaboratorDirect);

export default router;
import express from 'express';
import {
  getProfile,
  updateProfile,
  deleteAccount,
  getUserStats,
  searchUsers
} from '../controllers/userController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.delete('/account', deleteAccount);
router.get('/stats', getUserStats);
router.get('/search', searchUsers);

export default router;
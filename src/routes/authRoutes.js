import express from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  requestPasswordReset,
  resetPassword,
  changePassword,
  verifyEmail,
} from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  validateRegister,
  validateLogin,
  validateChangePassword
} from '../middleware/validation.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Traditional auth
router.post('/register', authLimiter, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);

// Token management
router.post('/refresh-token', refreshToken);
router.post('/logout', authMiddleware, logout);

// Password management
router.post('/request-password-reset', authLimiter, requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/change-password', authMiddleware, validateChangePassword, changePassword);

// Email verification
router.post('/verify-email', verifyEmail);

export default router;
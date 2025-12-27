import authService from '../services/authService.js';
import { validationResult } from 'express-validator';
import passport from '../config/passport.js'
import env from '../config/env.js';

export const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.errors = errors.array();
      return next(error);
    }

    const { email, password, name } = req.body;
    const result = await authService.register({ email, password, name });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.errors = errors.array();
      return next(error);
    }

    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    
    res.json({
      success: true,
      message: 'Login successful',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};


export const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
    
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      const error = new Error('Refresh token required');
      error.statusCode = 400;
      return next(error);
    }
    
    const result = await authService.refreshTokens(refreshToken);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      const error = new Error('Email required');
      error.statusCode = 400;
      return next(error);
    }
    
    await authService.requestPasswordReset(email);
    
    res.json({
      success: true,
      message: 'Password reset email sent if account exists'
    });
    
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      const error = new Error('Token and new password required');
      error.statusCode = 400;
      return next(error);
    }
    
    await authService.resetPassword(token, newPassword);
    
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.errors = errors.array();
      return next(error);
    }

    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      const error = new Error('Verification token required');
      error.statusCode = 400;
      return next(error);
    }
    
    await authService.verifyEmail(token);
    
    res.json({
      success: true,
      message: 'Email verified successfully'
    });
    
  } catch (error) {
    next(error);
  }
};
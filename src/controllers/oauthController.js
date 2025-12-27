// src/controllers/oauthController.js
import passport from '../config/passport.js';
import env from '../config/env.js';
import authService from '../services/authService.js';

export const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email']
});

export const googleCallback = async (req, res, next) => {
  passport.authenticate('google', { session: false }, (error, user) => {
    if (error) {
      console.error('Google OAuth Error:', error);
      return res.redirect(`${env.app.frontendUrl}/oauth/error?message=${encodeURIComponent(error.message)}`);
    }
    
    const tokenParams = new URLSearchParams({
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
      userId: user.user.id,
      email: user.user.email || '',
      name: user.user.name || '',
      avatar: user.user.avatar || ''
    });
    
    res.redirect(`${env.app.frontendUrl}/oauth/success?${tokenParams}`);
  })(req, res, next);
};

export const githubAuth = passport.authenticate('github', {
  scope: ['user:email']
});

export const githubCallback = async (req, res, next) => {
  passport.authenticate('github', { session: false }, (error, user) => {
    if (error) {
      console.error('GitHub OAuth Error:', error);
      return res.redirect(`${env.app.frontendUrl}/oauth/error?message=${encodeURIComponent(error.message)}`);
    }
    
    const tokenParams = new URLSearchParams({
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
      userId: user.user.id,
      email: user.user.email || '',
      name: user.user.name || '',
      avatar: user.user.avatar || ''
    });
    
    res.redirect(`${env.app.frontendUrl}/oauth/success?${tokenParams}`);
  })(req, res, next);
};
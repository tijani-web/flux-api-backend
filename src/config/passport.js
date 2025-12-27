import passport from 'passport';
import { Strategy as JwtStrategy } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import authService from '../services/authService.js';
import env from './env.js';

// JWT Strategy
passport.use(new JwtStrategy({
  jwtFromRequest: (req) => req.headers.authorization?.split(' ')[1],
  secretOrKey: env.jwt.secret
}, async (payload, done) => {
  try {
    const user = await authService.getUserById(payload.userId);
    if (user) return done(null, user);
    return done(null, false);
  } catch (error) {
    return done(error, false);
  }
}));

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: env.oauth.google.clientId,
  clientSecret: env.oauth.google.clientSecret,
  callbackURL: env.oauth.google.googleCallbackUrl
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await authService.oauthLogin('GOOGLE', {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      avatar: profile.photos[0]?.value
    });
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// GitHub OAuth Strategy  
passport.use(new GitHubStrategy({
  clientID: env.oauth.github.clientId,
  clientSecret: env.oauth.github.clientSecret,
  callbackURL: env.oauth.github.githubCallbackUrl,
  scope: ['user:email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await authService.oauthLogin('GITHUB', {
      id: profile.id,
      email: profile.emails[0]?.value || `${profile.username}@github.com`,
      name: profile.displayName || profile.username,
      avatar: profile.photos[0]?.value,
      username: profile.username
    });
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

export default passport;
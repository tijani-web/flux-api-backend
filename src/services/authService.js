import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database.js';
import env from '../config/env.js';
import emailService from './emailService.js';

class AuthService {
  // Register new user
  async register(userData) {
    const { email, password, name } = userData;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new Error('USER_ALREADY_EXISTS');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        emailVerified: false, // Set to true if not using email verification
        verificationToken: uuidv4()
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        createdAt: true
      }
    });

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(user.email, user.name);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't throw - user registration should still succeed
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id);

    return {
      user,
      ...tokens
    };
  }

  // Login user
  async login(credentials) {
    const { email, password } = credentials;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Check if email verified (if required)
    if (env.app.requireEmailVerification && !user.emailVerified) {
      throw new Error('EMAIL_NOT_VERIFIED');
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id);

    // Update last login (optional)
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() }
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        createdAt: user.createdAt
      },
      ...tokens
    };
  }

  // OAuth login/register
  async oauthLogin(provider, profile) {
    const { id, email, name, avatar } = profile;

    // Find existing OAuth account or create new user
    let user = await prisma.user.findFirst({
      where: {
        email: email
      },
      include: {
        oauthAccounts: {
          where: {
            provider,
            providerId: id
          }
        }
      }
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar,
          password: null, // No password for OAuth users
          emailVerified: true,
          oauthAccounts: {
            create: {
              provider,
              providerId: id,
              email,
              username: profile.username,
              avatar: profile.avatar
            }
          }
        },
        include: {
          oauthAccounts: true
        }
      });
    } else if (user.oauthAccounts.length === 0) {
      // Link OAuth account to existing user
      await prisma.oAuthAccount.create({
        data: {
          provider,
          providerId: id,
          userId: user.id,
          email,
          username: profile.username,
          avatar: profile.avatar
        }
      });
    }

    const tokens = this.generateTokens(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        createdAt: user.createdAt
      },
      ...tokens
    };
  }

  // Generate JWT tokens
  generateTokens(userId) {
    const accessToken = jwt.sign(
      { userId, type: 'access' },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      env.jwt.secret,
      { expiresIn: env.jwt.refreshExpiresIn || '30d' }
    );

    return { accessToken, refreshToken };
  }

  // Verify token
  verifyToken(token) {
    return jwt.verify(token, env.jwt.secret);
  }

  // Refresh token
  async refreshTokens(refreshToken) {
    try {
      const decoded = this.verifyToken(refreshToken);
      
      if (decoded.type !== 'refresh') {
        throw new Error('INVALID_TOKEN_TYPE');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true
        }
      });

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      const tokens = this.generateTokens(user.id);

      return {
        user,
        ...tokens
      };
    } catch (error) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }
  }

  // Logout (if using session invalidation)
  async logout(userId, token) {
    // If using session management, invalidate the session here
    // For now, we'll just return success
    return { success: true };
  }

  // Change password
  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('INVALID_CURRENT_PASSWORD');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    return { success: true };
  }

  // Request password reset
  async requestPasswordReset(email) {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Don't reveal if user exists
      return { success: true };
    }

    const resetToken = uuidv4();
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    await emailService.sendPasswordResetEmail(user.email, user.name, resetToken);

    return { success: true };
  }

  // Reset password with token
  async resetPassword(token, newPassword) {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      throw new Error('INVALID_OR_EXPIRED_TOKEN');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    return { success: true };
  }
}

export default new AuthService();
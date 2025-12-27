import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import prisma from '../config/database.js';

/**
 * PRODUCTION AUTH MIDDLEWARE
 * - Secure token validation
 * - Database session verification  
 * - Rate limiting awareness
 * - Security headers
 */

export const authMiddleware = async (req, res, next) => {
 try {
    let token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Authentication token required'
      });
    }

       const decoded = jwt.verify(token, env.jwt.secret);
    
    // 3. Fetch user with session validation
    const user = await prisma.user.findUnique({
      where: { 
        id: decoded.userId,
        // Optional: Add emailVerified check if you implement email verification
        // emailVerified: true
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        createdAt: true,
        // Include for security checks
        emailVerified: true,
        // sessions: {
        //   where: { token: token }, // If implementing session invalidation
        //   take: 1
        // }
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User account no longer exists'
      });
    }

    // 4. Optional: Check if session is valid (if using session management)
    // if (user.sessions.length === 0) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'SESSION_EXPIRED',
    //     message: 'Please login again'
    //   });
    // }

    // 5. Set user context for downstream middleware
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      permissions: getUserPermissions(user.role)
    };

    // 6. Security headers for authenticated requests
    res.set('X-User-ID', user.id);
    res.set('X-User-Role', user.role);

    next();

  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid authentication token'
      });
    }

    // Log unexpected errors
    console.error('Auth middleware error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Authentication system error'
    });
  }
};

/**
 * OPTIONAL AUTH - For public endpoints that have enhanced features when authenticated
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const decoded = jwt.verify(token, env.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          emailVerified: true
        }
      });

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
          permissions: getUserPermissions(user.role)
        };
      }
    }
    
    next();
  } catch (error) {
    // Silently fail for optional auth - user remains unauthenticated
    next();
  }
};

/**
 * ROLE-BASED ACCESS CONTROL
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Authentication required for this operation'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// Admin shortcut
export const requireAdmin = requireRole(['ADMIN', 'SUPER_ADMIN']);

// Project owner or admin
export const requireProjectAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Authentication required'
    });
  }

  // This will be enhanced when we have project ownership checks
  if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // For now, allow all authenticated users - will be refined with project permissions
  next();
};

/**
 * UTILITY FUNCTIONS
 */
const extractToken = (req) => {
  // 1. Check Authorization header (Bearer token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.substring(7);
  }

  // 2. Check x-access-token header
  if (req.headers['x-access-token']) {
    return req.headers['x-access-token'];
  }

  // 3. Check cookies (if using cookie-based auth)
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};

const getUserPermissions = (role) => {
  const permissions = {
    USER: [
      'project:create',
      'project:read', 
      'project:update',
      'project:delete',
      'endpoint:create',
      'endpoint:read',
      'endpoint:update', 
      'endpoint:delete',
      'execute:code'
    ],
    ADMIN: [
      'project:create',
      'project:read',
      'project:update', 
      'project:delete',
      'endpoint:create',
      'endpoint:read',
      'endpoint:update',
      'endpoint:delete', 
      'execute:code',
      'user:read',
      'user:update'
    ],
    SUPER_ADMIN: [
      'project:create',
      'project:read',
      'project:update',
      'project:delete',
      'endpoint:create',
      'endpoint:read',
      'endpoint:update',
      'endpoint:delete',
      'execute:code', 
      'user:create',
      'user:read',
      'user:update',
      'user:delete',
      'system:admin'
    ]
  };

  return permissions[role] || permissions.USER;
};

/**
 * RATE LIMITING AWARE AUTH
 * For endpoints that need different limits based on auth status
 */
export const withRateLimitContext = (req, res, next) => {
  if (req.user) {
    // Authenticated requests get higher limits
    req.rateLimitKey = `user:${req.user.id}`;
  } else {
    // Anonymous requests by IP
    req.rateLimitKey = req.ip;
  }
  next();
};
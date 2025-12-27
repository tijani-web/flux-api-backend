import { body, validationResult } from 'express-validator';

/**
 * SANDBOX SECURITY MIDDLEWARE (LESS STRICT)
 * - Blocks truly dangerous operations only
 * - Allows normal JavaScript patterns
 * - Focuses on security, not over-restriction
 */

// Validate code before execution
export const validateCodeExecution = [
  body('code')
  .custom()
    .notEmpty()
    .withMessage('Code is required')
    .isLength({ max: 50000 }) // Increased from 10k to 50k
    .withMessage('Code exceeds maximum length of 50,000 characters')
    .custom((code) => {
      // Block TRULY dangerous operations only
      const dangerousPatterns = [
        // File system access
        /require\s*\(\s*['"]fs['"]\s*\)/gi,
        /import\s*\(\s*['"]fs['"]\s*\)/gi,
        
        // Process manipulation
        /require\s*\(\s*['"]child_process['"]\s*\)/gi,
        /import\s*\(\s*['"]child_process['"]\s*\)/gi,
        /process\.exit\s*\(/gi,
        /process\.kill\s*\(/gi,
        
        // Code injection
        /eval\s*\(/gi,
        /Function\s*\(/gi,
        /new Function/gi,
        
        // Network access
        /require\s*\(\s*['"]net['"]\s*\)/gi,
        /require\s*\(\s*['"]http['"]\s*\)/gi,
        /require\s*\(\s*['"]https['"]\s*\)/gi,
        
        // System access
        /require\s*\(\s*['"]os['"]\s*\)/gi,
        
        // Infinite loops (truly infinite)
        /while\s*\(\s*true\s*\)/gi,
        /for\s*\(\s*;\s*;\s*\)/gi,
        /for\s*\(\s*.*;\s*.*;\s*\)\s*{\s*}/gi, // Empty loop body
      ];

      // Check for dangerous patterns
      for (const pattern of dangerousPatterns) {
        const matches = code.match(pattern);
        if (matches) {
          console.log(`Blocked dangerous pattern: ${pattern}`, matches);
          throw new Error(`Code contains prohibited operation: ${matches[0]}`);
        }
      }

      // Check for excessive loops (allow up to 10)
      const loopCount = (code.match(/for\s*\(|while\s*\(|do\s*{/g) || []).length;
      if (loopCount > 10) {
        throw new Error(`Too many loops (${loopCount}). Maximum allowed: 10`);
      }

      // Check for potential memory bombs
      const arrayAllocations = (code.match(/new Array\s*\(\s*\d{5,}|Array\s*\(\s*\d{5,}/g) || []).length;
      if (arrayAllocations > 0) {
        throw new Error('Code attempts to allocate very large arrays');
      }

      return true;
    }),
  
  body('timeout')
    .optional()
    .isInt({ min: 100, max: 60000 }) // Increased to 60 seconds
    .withMessage('Timeout must be between 100ms and 60 seconds'),
  
  body('memoryLimit')
    .optional()
    .isInt({ min: 64, max: 1024 }) // Increased to 1GB
    .withMessage('Memory limit must be between 64MB and 1024MB'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'CODE_VALIDATION_FAILED', // Better error name
        message: 'Code validation failed',
        details: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
          value: err.value
        }))
      });
    }
    next();
  }
];

// Rate limiting per user for code execution
export const executionRateLimit = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  // Simple in-memory rate limiting for development
  const userExecutions = {}; // In production, use Redis
  
  const userId = req.user.id;
  const now = Date.now();
  const hourAgo = now - 3600000;
  
  // Initialize user's execution record
  if (!userExecutions[userId]) {
    userExecutions[userId] = [];
  }
  
  // Clean old executions
  userExecutions[userId] = userExecutions[userId].filter(time => time > hourAgo);
  
  // Check limit (1000 executions per hour)
  if (userExecutions[userId].length >= 1000) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Hourly execution limit exceeded (1000 requests/hour)',
      retryAfter: Math.ceil((userExecutions[userId][0] + 3600000 - now) / 1000)
    });
  }
  
  // Add current execution
  userExecutions[userId].push(now);
  
  next();
};

// Resource usage tracking
export const trackResourceUsage = async (req, res, next) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  // Store original response methods
  const originalJson = res.json;
  const originalSend = res.send;

  // Track when response is sent
  res.json = function(data) {
    return sendResponse.call(this, data, originalJson);
  };
  
  res.send = function(data) {
    return sendResponse.call(this, data, originalSend);
  };

  function sendResponse(data, originalMethod) {
    const executionTime = Date.now() - startTime;
    const memoryUsed = process.memoryUsage().heapUsed - startMemory;

    // Log execution metrics
    console.log('📊 Execution metrics:', {
      userId: req.user?.id,
      endpoint: req.originalUrl,
      time: executionTime + 'ms',
      memory: Math.round(memoryUsed / 1024 / 1024) + 'MB',
      timestamp: new Date().toISOString()
    });

    // Add metrics to response if it's JSON
    if (data && typeof data === 'object' && originalMethod === originalJson) {
      if (!data.metrics) {
        data.metrics = {
          executionTime,
          memoryUsed: Math.round(memoryUsed / 1024 / 1024), // MB
          timestamp: new Date().toISOString()
        };
      }
    }

    // Warn about long executions (over 30 seconds)
    if (executionTime > 30000) {
      console.warn(`⚠️ Long execution detected: ${executionTime}ms`);
    }

    // Warn about high memory usage (over 500MB)
    if (memoryUsed > 500 * 1024 * 1024) {
      console.error(`🚨 High memory usage: ${Math.round(memoryUsed / 1024 / 1024)}MB`);
    }

    return originalMethod.call(this, data);
  }

  next();
};

// Security headers for sandbox responses
export const sandboxSecurityHeaders = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  });
  
  // Only add CSP for HTML responses
  const acceptHeader = req.headers.accept || '';
  if (acceptHeader.includes('text/html')) {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
  }
  
  next();
};

// Simple health check middleware
export const sandboxHealthCheck = (req, res, next) => {
  // Check if sandbox service is available
  const sandboxStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
  
  // Attach to request for later use
  req.sandboxStatus = sandboxStatus;
  
  // Set header for debugging
  res.set('X-Sandbox-Status', 'healthy');
  
  next();
};
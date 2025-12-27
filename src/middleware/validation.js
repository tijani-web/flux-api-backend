import { body, validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

export const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-30 characters and alphanumeric'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase and number'),
  handleValidationErrors
];

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

export const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must be at least 8 characters with uppercase, lowercase and number'),
  handleValidationErrors
];


// Add these validation functions to your validation.js file

export const validateProjectCreate = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Project name must be 3-100 characters')
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('Project name can only contain letters, numbers, spaces, hyphens, and underscores'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('visibility')
    .optional()
    .isIn(['PRIVATE', 'TEAM', 'PUBLIC'])
    .withMessage('Visibility must be PRIVATE, TEAM, or PUBLIC'),
  handleValidationErrors
];

export const validateEndpointCreate = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Endpoint name must be 3-50 characters'),
  body('path')
    .trim()
    .matches(/^\/[a-zA-Z0-9_\-/:{}.\[\]]+$/)  // ⭐ Allows :, {}, []
    .withMessage('Path must start with / and can contain letters, numbers, _, -, /, :, {}, [], .'),
  body('method')
    .isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
    .withMessage('Invalid HTTP method'),
  body('code')
    .notEmpty()
    .withMessage('Code is required')
    .isLength({ max: 10000 })
    .withMessage('Code cannot exceed 10000 characters'),
  handleValidationErrors
];

export const validateEndpointUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Endpoint name must be 3-50 characters'),
  body('path')
    .optional()
    .trim()
    .matches(/^\/[a-zA-Z0-9_\-/:{}.\[\]]+$/)  // Same fix here
    .withMessage('Path must start with / and can contain letters, numbers, _, -, /, :, {}, [], .'),
  body('method')
    .optional()
    .isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
    .withMessage('Invalid HTTP method'),
  body('code')
    .optional()
    .isLength({ max: 10000 })
    .withMessage('Code cannot exceed 10000 characters'),
  handleValidationErrors
];

export const validateMockDataCreate = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Collection name must be 2-50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Collection name can only contain letters, numbers, and underscores'),
  handleValidationErrors
];

export const validateEnvironmentCreate = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Environment name must be 2-50 characters')
    .matches(/^[a-zA-Z0-9_\-]+$/)
    .withMessage('Environment name can only contain letters, numbers, hyphens, and underscores'),
  handleValidationErrors
];
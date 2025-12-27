/**
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * Catches all errors and sends consistent JSON responses
 */

const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err);

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // Prisma errors
  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'Resource already exists';
    errors = { field: err.meta?.target };
  }

  if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Resource not found';
  }

  if (err.code === 'P2003') {
    statusCode = 400;
    message = 'Invalid reference';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = err.errors;
  }

  if (err.code === 'P1017') {
    statusCode = 503;
    message = 'Database connection lost';
  }

  if (err.code === 'P2016') {
    statusCode = 400;
    message = 'Query interpretation error';
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    error: message,
    errors: errors,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export default errorHandler;
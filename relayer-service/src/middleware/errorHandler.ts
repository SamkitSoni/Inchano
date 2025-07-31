import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { recordError } from '../utils/metrics';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Record error metrics
  const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
  const component = req.path.split('/')[1] || 'unknown'; // Extract first path segment
  recordError(errorType, component);

  // Log the error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    statusCode,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    errorType,
    component,
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message: process.env['NODE_ENV'] === 'production' 
        ? (statusCode >= 500 ? 'Internal Server Error' : message)
        : message,
      ...(process.env['NODE_ENV'] !== 'production' && { stack: err.stack }),
    },
    timestamp: new Date().toISOString(),
    path: req.path,
  });
};

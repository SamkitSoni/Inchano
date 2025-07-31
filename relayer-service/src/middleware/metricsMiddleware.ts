import { Request, Response, NextFunction } from 'express';
import { recordHttpRequest } from '../utils/metrics';
import { logger } from '../utils/logger';

// Extend Request interface to include timing information
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
    }
  }
}

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Record start time
  req.startTime = Date.now();

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  
  res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void): Response {
    // Calculate duration
    const duration = req.startTime ? (Date.now() - req.startTime) / 1000 : 0;
    
    // Record metrics
    try {
      const route = req.route?.path || req.path || 'unknown';
      recordHttpRequest(req.method, route, res.statusCode, duration);
      
      // Log slow requests (over 5 seconds)
      if (duration > 5) {
        logger.warn('Slow HTTP request detected', {
          method: req.method,
          route,
          statusCode: res.statusCode,
          duration: `${duration}s`,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      }
    } catch (error) {
      logger.error('Error recording HTTP metrics:', error);
    }
    
    // Call original end method
    return originalEnd.call(this, chunk, encoding as BufferEncoding, cb);
  };

  next();
};

export const metricsRoute = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { register } = await import('../utils/metrics');
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Error serving metrics:', error);
    res.status(500).json({
      error: 'Failed to collect metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

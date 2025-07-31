import winston from 'winston';
import path from 'path';

const level = process.env['LOG_LEVEL'] || 'info';
const logDir = 'logs';

// Custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] }),
  winston.format.json()
);

const logger = winston.createLogger({
  level,
  format: customFormat,
  defaultMeta: { 
    service: 'relayer-service',
    version: process.env['npm_package_version'] || '1.0.0',
    environment: process.env['NODE_ENV'] || 'development'
  },
  transports: [
    // Error logs - only errors
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Warning logs
    new winston.transports.File({ 
      filename: path.join(logDir, 'warn.log'), 
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      tailable: true
    }),
    
    // All logs
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    }),
    
    // Audit logs for important business events
    new winston.transports.File({ 
      filename: path.join(logDir, 'audit.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 20,
      tailable: true
    })
  ],
});

// If we're not in production, log to the console with a simple format
if (process.env['NODE_ENV'] !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export { logger };

import { Request, Response, NextFunction } from 'express';
import { errorHandler, ApiError } from '../errorHandler';
import { logger } from '../../utils/logger';
import { recordError } from '../../utils/metrics';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('../../utils/metrics', () => ({
  recordError: jest.fn(),
}));

describe('errorHandler middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    originalNodeEnv = process.env.NODE_ENV;

    mockRequest = {
      path: '/api/orders',
      url: '/api/orders?limit=10',
      method: 'GET',
      ip: '192.168.1.100',
      get: jest.fn().mockReturnValue('Mozilla/5.0 Test Browser'),
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false,
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('basic error handling', () => {
    it('should handle basic errors with default values', () => {
      const error = new Error('Test error message') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Test error message',
          stack: expect.any(String),
        },
        timestamp: expect.any(String),
        path: '/api/orders',
      });
    });

    it('should handle errors with custom status codes', () => {
      const error = new Error('Not found') as ApiError;
      error.statusCode = 404;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Not found',
          stack: expect.any(String),
        },
        timestamp: expect.any(String),
        path: '/api/orders',
      });
    });

    it('should handle errors without messages', () => {
      const error = new Error() as ApiError;
      error.statusCode = 400;
      error.message = '';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal Server Error',
          stack: expect.any(String),
        },
        timestamp: expect.any(String),
        path: '/api/orders',
      });
    });
  });

  describe('production environment behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should hide server error details in production', () => {
      const error = new Error('Database connection failed') as ApiError;
      error.statusCode = 500;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal Server Error', // Generic message
        },
        timestamp: expect.any(String),
        path: '/api/orders',
      });
    });

    it('should show client error details in production', () => {
      const error = new Error('Invalid request format') as ApiError;
      error.statusCode = 400;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid request format', // Original message
        },
        timestamp: expect.any(String),
        path: '/api/orders',
      });
    });

    it('should not include stack traces in production', () => {
      const error = new Error('Test error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.error).not.toHaveProperty('stack');
    });
  });

  describe('development environment behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should show original error messages in development', () => {
      const error = new Error('Database connection failed') as ApiError;
      error.statusCode = 500;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Database connection failed', // Original message
          stack: expect.any(String),
        },
        timestamp: expect.any(String),
        path: '/api/orders',
      });
    });

    it('should include stack traces in development', () => {
      const error = new Error('Test error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.error).toHaveProperty('stack');
    });
  });

  describe('logging functionality', () => {
    it('should log error details', () => {
      const error = new Error('Test error') as ApiError;
      error.statusCode = 422;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', {
        message: 'Test error',
        stack: expect.any(String),
        statusCode: 422,
        url: '/api/orders?limit=10',
        method: 'GET',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Test Browser',
        errorType: 'client_error',
        component: 'api',
      });
    });

    it('should extract component from request path', () => {
      mockRequest.path = '/health/check';
      const error = new Error('Health check failed') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', expect.objectContaining({
        component: 'health',
      }));
    });

    it('should handle paths without components', () => {
      mockRequest.path = '/';
      const error = new Error('Root error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', expect.objectContaining({
        component: 'unknown',
      }));
    });

    it('should handle missing user agent', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);
      const error = new Error('Test error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', expect.objectContaining({
        userAgent: undefined,
      }));
    });
  });

  describe('metrics recording', () => {
    it('should record server errors (5xx) with correct type', () => {
      const error = new Error('Server error') as ApiError;
      error.statusCode = 500;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(recordError).toHaveBeenCalledWith('server_error', 'api');
    });

    it('should record client errors (4xx) with correct type', () => {
      const error = new Error('Client error') as ApiError;
      error.statusCode = 400;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(recordError).toHaveBeenCalledWith('client_error', 'api');
    });

    it('should record errors without status code as server errors', () => {
      const error = new Error('Unknown error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(recordError).toHaveBeenCalledWith('server_error', 'api');
    });

    it('should record metrics with correct component from different paths', () => {
      const testCases = [
        { path: '/orders/123', expectedComponent: 'orders' },
        { path: '/websocket/connect', expectedComponent: 'websocket' },
        { path: '/health', expectedComponent: 'health' },
        { path: '', expectedComponent: 'unknown' },
      ];

      testCases.forEach(({ path, expectedComponent }) => {
        jest.clearAllMocks();
        mockRequest.path = path;
        const error = new Error('Test error') as ApiError;

        errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(recordError).toHaveBeenCalledWith('server_error', expectedComponent);
      });
    });
  });

  describe('response already sent handling', () => {
    it('should delegate to Express default handler if headers already sent', () => {
      mockResponse.headersSent = true;
      const error = new Error('Late error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should still log and record metrics even if headers already sent', () => {
      mockResponse.headersSent = true;
      const error = new Error('Late error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      // Should not log or record metrics since we return early
      expect(logger.error).not.toHaveBeenCalled();
      expect(recordError).not.toHaveBeenCalled();
    });
  });

  describe('error types classification', () => {
    const testCases = [
      { statusCode: 200, expectedType: 'client_error' },
      { statusCode: 400, expectedType: 'client_error' },
      { statusCode: 404, expectedType: 'client_error' },
      { statusCode: 422, expectedType: 'client_error' },
      { statusCode: 499, expectedType: 'client_error' },
      { statusCode: 500, expectedType: 'server_error' },
      { statusCode: 502, expectedType: 'server_error' },
      { statusCode: 503, expectedType: 'server_error' },
      { statusCode: 599, expectedType: 'server_error' },
    ];

    testCases.forEach(({ statusCode, expectedType }) => {
      it(`should classify ${statusCode} as ${expectedType}`, () => {
        const error = new Error('Test error') as ApiError;
        error.statusCode = statusCode;

        errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(recordError).toHaveBeenCalledWith(expectedType, 'api');
        expect(logger.error).toHaveBeenCalledWith('Error occurred:', expect.objectContaining({
          errorType: expectedType,
        }));
      });
    });
  });

  describe('timestamp formatting', () => {
    it('should include a valid ISO timestamp', () => {
      const error = new Error('Test error') as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      const timestamp = new Date(jsonCall.timestamp);
      
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(jsonCall.timestamp);
    });
  });

  describe('operational vs non-operational errors', () => {
    it('should handle operational errors', () => {
      const error = new Error('Operational error') as ApiError;
      error.isOperational = true;
      error.statusCode = 400;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle non-operational errors', () => {
      const error = new Error('Non-operational error') as ApiError;
      error.isOperational = false;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle null error objects', () => {
      const error = null as any;

      expect(() => {
        errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      }).not.toThrow();
    });

    it('should handle errors with circular references in stack', () => {
      const error = new Error('Circular error') as ApiError;
      const circular: any = { error };
      circular.self = circular;
      error.stack = JSON.stringify(circular);

      expect(() => {
        errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      }).not.toThrow();
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new Error(longMessage) as ApiError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          message: longMessage,
        }),
      }));
    });

    it('should handle requests with missing properties', () => {
      const minimalRequest = {
        path: undefined,
        url: undefined,
        method: undefined,
        ip: undefined,
        get: jest.fn().mockReturnValue(undefined),
      } as any;

      const error = new Error('Test error') as ApiError;

      expect(() => {
        errorHandler(error, minimalRequest, mockResponse as Response, mockNext);
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', expect.objectContaining({
        url: undefined,
        method: undefined,
        ip: undefined,
        userAgent: undefined,
      }));
    });
  });
});

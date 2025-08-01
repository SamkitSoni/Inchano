import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { healthCheckStatus } from '../utils/metrics';

const router = Router();

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  memory: NodeJS.MemoryUsage;
  services: {
    escrowMonitor: 'healthy' | 'unhealthy' | 'unknown';
    webSocket: 'healthy' | 'unhealthy' | 'unknown';
    priceUpdater: 'healthy' | 'unhealthy' | 'unknown';
  };
  metrics: {
    totalRequests: number;
    totalErrors: number;
    activeConnections: number;
  };
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get metrics from registry
    const { register } = await import('../utils/metrics');
    const metrics = await register.getMetricsAsJSON();
    
    // Extract relevant metrics
    const httpRequestsMetric = metrics.find(m => m.name === 'relayer_service_http_requests_total');
    const errorsMetric = metrics.find(m => m.name === 'relayer_service_errors_total');
    const wsConnectionsMetric = metrics.find(m => m.name === 'relayer_service_websocket_connections_total');
    
    const totalRequests = httpRequestsMetric?.values.reduce((sum, v) => sum + (v.value || 0), 0) || 0;
    const totalErrors = errorsMetric?.values.reduce((sum, v) => sum + (v.value || 0), 0) || 0;
    const activeConnections = wsConnectionsMetric?.values[0]?.value || 0;
    
    const healthData: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] || '1.0.0',
      environment: process.env['NODE_ENV'] || 'development',
      memory: process.memoryUsage(),
      services: {
        escrowMonitor: 'healthy', // Could be enhanced with actual service checks
        webSocket: 'healthy',
        priceUpdater: 'healthy'
      },
      metrics: {
        totalRequests,
        totalErrors,
        activeConnections
      }
    };

    // Update health status metric
    healthCheckStatus.set(1);
    
    logger.info('Health check performed', { 
      ip: req.ip,
      totalRequests,
      totalErrors,
      activeConnections
    });
    
    res.status(200).json(healthData);
  } catch (error) {
    healthCheckStatus.set(0);
    logger.error('Health check failed', { error, ip: req.ip });
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
    });
  }
});

export { router as healthRouter };

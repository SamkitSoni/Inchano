import client from 'prom-client';
import { logger } from './logger';

// Initialize default metrics collection
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ 
  prefix: 'relayer_service_',
});

// HTTP Request Metrics
export const httpRequestDuration = new client.Histogram({
  name: 'relayer_service_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

export const httpRequestsTotal = new client.Counter({
  name: 'relayer_service_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// WebSocket Metrics
export const websocketConnectionsTotal = new client.Gauge({
  name: 'relayer_service_websocket_connections_total',
  help: 'Total number of active WebSocket connections'
});

export const websocketMessagesTotal = new client.Counter({
  name: 'relayer_service_websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['type', 'direction'] // direction: 'inbound' | 'outbound'
});

// Order Processing Metrics
export const ordersProcessedTotal = new client.Counter({
  name: 'relayer_service_orders_processed_total',
  help: 'Total number of orders processed',
  labelNames: ['status', 'type'] // status: 'created', 'filled', 'cancelled', etc.
});

export const orderProcessingDuration = new client.Histogram({
  name: 'relayer_service_order_processing_duration_seconds',
  help: 'Duration of order processing in seconds',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

// Escrow Monitor Metrics
export const escrowEventsTotal = new client.Counter({
  name: 'relayer_service_escrow_events_total',
  help: 'Total number of escrow events processed',
  labelNames: ['event_type', 'contract_address']
});

export const escrowMonitorErrors = new client.Counter({
  name: 'relayer_service_escrow_monitor_errors_total',
  help: 'Total number of escrow monitor errors',
  labelNames: ['error_type']
});

// Blockchain Interaction Metrics
export const blockchainCallsTotal = new client.Counter({
  name: 'relayer_service_blockchain_calls_total',
  help: 'Total number of blockchain calls',
  labelNames: ['network', 'method', 'status']
});

export const blockchainCallDuration = new client.Histogram({
  name: 'relayer_service_blockchain_call_duration_seconds',
  help: 'Duration of blockchain calls in seconds',
  labelNames: ['network', 'method'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

// Error Metrics
export const errorsTotal = new client.Counter({
  name: 'relayer_service_errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'component']
});

// Price Update Metrics
export const priceUpdatesTotal = new client.Counter({
  name: 'relayer_service_price_updates_total',
  help: 'Total number of price updates',
  labelNames: ['status'] // status: 'success', 'failure'
});

export const priceUpdateDuration = new client.Histogram({
  name: 'relayer_service_price_update_duration_seconds',
  help: 'Duration of price update operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Application Health Metrics
export const healthCheckStatus = new client.Gauge({
  name: 'relayer_service_health_check_status',
  help: 'Health check status (1 = healthy, 0 = unhealthy)'
});

export const uptimeSeconds = new client.Gauge({
  name: 'relayer_service_uptime_seconds',
  help: 'Application uptime in seconds'
});

// Memory and Performance Metrics
export const memoryUsageBytes = new client.Gauge({
  name: 'relayer_service_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'] // type: 'rss', 'heapUsed', 'heapTotal', 'external'
});

// Custom metric collection function
export const collectCustomMetrics = () => {
  try {
    // Update uptime
    uptimeSeconds.set(process.uptime());
    
    // Update memory usage
    const memUsage = process.memoryUsage();
    memoryUsageBytes.labels('rss').set(memUsage.rss);
    memoryUsageBytes.labels('heapUsed').set(memUsage.heapUsed);
    memoryUsageBytes.labels('heapTotal').set(memUsage.heapTotal);
    memoryUsageBytes.labels('external').set(memUsage.external);
    
    // Update health check status (assume healthy if no errors in last collection)
    healthCheckStatus.set(1);
    
  } catch (error) {
    logger.error('Error collecting custom metrics:', error);
    healthCheckStatus.set(0);
    errorsTotal.labels('metrics_collection', 'system').inc();
  }
};

// Start collecting custom metrics every 30 seconds
setInterval(collectCustomMetrics, 30000);

// Export the registry for metrics endpoint
export const register = client.register;

// Helper functions for common metric operations
export const recordHttpRequest = (method: string, route: string, statusCode: number, duration: number) => {
  httpRequestsTotal.labels(method, route, statusCode.toString()).inc();
  httpRequestDuration.labels(method, route, statusCode.toString()).observe(duration);
};

export const recordWebSocketMessage = (type: string, direction: 'inbound' | 'outbound') => {
  websocketMessagesTotal.labels(type, direction).inc();
};

export const recordOrderProcessed = (status: string, type: string, duration?: number) => {
  ordersProcessedTotal.labels(status, type).inc();
  if (duration !== undefined) {
    orderProcessingDuration.labels(type).observe(duration);
  }
};

export const recordEscrowEvent = (eventType: string, contractAddress: string) => {
  escrowEventsTotal.labels(eventType, contractAddress).inc();
};

export const recordBlockchainCall = (network: string, method: string, status: string, duration: number) => {
  blockchainCallsTotal.labels(network, method, status).inc();
  blockchainCallDuration.labels(network, method).observe(duration);
};

export const recordError = (errorType: string, component: string) => {
  errorsTotal.labels(errorType, component).inc();
};

export const recordPriceUpdate = (status: 'success' | 'failure', duration: number) => {
  priceUpdatesTotal.labels(status).inc();
  priceUpdateDuration.observe(duration);
};

logger.info('Metrics system initialized');

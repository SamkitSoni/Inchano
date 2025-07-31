# Monitoring, Metrics & Error Handling Setup

This document describes the comprehensive monitoring and logging system implemented for the DeFi Relayer Service.

## Overview

The monitoring system provides:
- **Prometheus metrics** for operational oversight
- **Structured logging** with Winston for debugging and audit trails
- **Health checks** for service status monitoring
- **Error tracking** and alerting capabilities
- **WebSocket connection monitoring**
- **Performance metrics** for optimization

## Components

### 1. Metrics Collection (`src/utils/metrics.ts`)

#### Available Metrics

**HTTP Metrics:**
- `relayer_service_http_requests_total` - Total HTTP requests by method, route, status
- `relayer_service_http_request_duration_seconds` - HTTP request duration histogram

**WebSocket Metrics:**
- `relayer_service_websocket_connections_total` - Active WebSocket connections
- `relayer_service_websocket_messages_total` - WebSocket messages by type and direction

**Order Processing Metrics:**
- `relayer_service_orders_processed_total` - Orders processed by status and type
- `relayer_service_order_processing_duration_seconds` - Order processing duration

**Escrow Monitor Metrics:**
- `relayer_service_escrow_events_total` - Escrow events by type and contract
- `relayer_service_escrow_monitor_errors_total` - Escrow monitor errors

**Blockchain Metrics:**
- `relayer_service_blockchain_calls_total` - Blockchain calls by network, method, status
- `relayer_service_blockchain_call_duration_seconds` - Blockchain call duration

**Error Metrics:**
- `relayer_service_errors_total` - Total errors by type and component

**System Metrics:**
- `relayer_service_uptime_seconds` - Application uptime
- `relayer_service_memory_usage_bytes` - Memory usage by type
- `relayer_service_health_check_status` - Health check status (1=healthy, 0=unhealthy)

#### Helper Functions
```typescript
import { recordHttpRequest, recordWebSocketMessage, recordError } from './utils/metrics';

// Record HTTP request
recordHttpRequest('GET', '/api/orders', 200, 0.5);

// Record WebSocket message
recordWebSocketMessage('ping', 'inbound');

// Record error
recordError('validation_error', 'orders');
```

### 2. Logging System (`src/utils/logger.ts`)

#### Log Files Structure
```
logs/
├── error.log      # Error level logs only (5MB, 5 files)
├── warn.log       # Warning level logs (5MB, 3 files)
├── combined.log   # All logs (10MB, 10 files)
└── audit.log      # Important business events (10MB, 20 files)
```

#### Log Format
```json
{
  "level": "info",
  "message": "Order created via WebSocket",
  "timestamp": "2025-01-28 16:18:00.123",
  "service": "relayer-service",
  "version": "1.0.0",
  "environment": "development",
  "metadata": {
    "orderHash": "0x123...",
    "clientId": "client_123"
  }
}
```

#### Usage Examples
```typescript
import { logger } from './utils/logger';

logger.info('Order processed successfully', { orderHash, duration });
logger.warn('Slow database query detected', { query, duration });
logger.error('Failed to process order', { error, orderHash });
```

### 3. Health Checks (`src/routes/health.ts`)

#### Endpoint: `GET /health`

**Response Format:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-28T16:18:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "development",
  "memory": {
    "rss": 50331648,
    "heapUsed": 25165824,
    "heapTotal": 33554432,
    "external": 1048576
  },
  "services": {
    "escrowMonitor": "healthy",
    "webSocket": "healthy",
    "priceUpdater": "healthy"
  },
  "metrics": {
    "totalRequests": 150,
    "totalErrors": 2,
    "activeConnections": 5
  }
}
```

### 4. Metrics Endpoint (`GET /metrics`)

Provides Prometheus-compatible metrics for scraping:
```
# HELP relayer_service_http_requests_total Total number of HTTP requests
# TYPE relayer_service_http_requests_total counter
relayer_service_http_requests_total{method="GET",route="/health",status_code="200"} 10

# HELP relayer_service_websocket_connections_total Total number of active WebSocket connections
# TYPE relayer_service_websocket_connections_total gauge
relayer_service_websocket_connections_total 5
```

### 5. Error Handling (`src/middleware/errorHandler.ts`)

Enhanced error handler that:
- Records error metrics automatically
- Logs structured error information
- Provides different error responses for production vs. development
- Tracks error patterns by component and type

### 6. Request Monitoring (`src/middleware/metricsMiddleware.ts`)

Automatic HTTP request monitoring:
- Records request duration and status codes
- Logs slow requests (>5 seconds)
- Tracks all API endpoint usage

## Setup Instructions

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Key monitoring variables:
```env
LOG_LEVEL=info
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30000
METRICS_COLLECTION_INTERVAL=30000
```

### 2. Ensure Log Directory

The application will create the logs directory automatically, but you can create it manually:
```bash
mkdir -p logs
```

### 3. Start the Application

```bash
npm run dev    # Development
npm start      # Production
```

### 4. Access Monitoring Endpoints

- **Health Check:** `http://localhost:3000/health`
- **Metrics:** `http://localhost:3000/metrics`

## Prometheus Configuration

Add to your `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'relayer-service'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

## Grafana Dashboard

### Key Panels to Monitor:

1. **HTTP Requests Rate**
   - Query: `rate(relayer_service_http_requests_total[5m])`

2. **Error Rate**
   - Query: `rate(relayer_service_errors_total[5m])`

3. **WebSocket Connections**
   - Query: `relayer_service_websocket_connections_total`

4. **Memory Usage**
   - Query: `relayer_service_memory_usage_bytes`

5. **Response Time P95**
   - Query: `histogram_quantile(0.95, relayer_service_http_request_duration_seconds_bucket)`

## Alerting Rules

### Prometheus Alert Rules

```yaml
groups:
  - name: relayer-service
    rules:
      - alert: HighErrorRate
        expr: rate(relayer_service_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"

      - alert: ServiceDown
        expr: relayer_service_health_check_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Relayer service is down"

      - alert: HighMemoryUsage
        expr: relayer_service_memory_usage_bytes{type="heapUsed"} > 100000000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage detected"
```

## Log Analysis

### Useful Log Queries

**Find all errors:**
```bash
grep '"level":"error"' logs/combined.log | jq .
```

**Monitor WebSocket connections:**
```bash
tail -f logs/combined.log | grep "WebSocket"
```

**Check order processing:**
```bash
grep "order" logs/combined.log | jq '.timestamp, .message, .metadata'
```

## Performance Optimization

### Monitoring Performance Impact

The monitoring system is designed to be lightweight:
- Metrics collection runs every 30 seconds
- Log rotation prevents disk space issues
- Async logging doesn't block request processing
- Metrics use minimal memory with appropriate bucketing

### Best Practices

1. **Log Levels:** Use appropriate log levels (error, warn, info, debug)
2. **Structured Logging:** Always include relevant metadata
3. **Metric Labels:** Keep metric labels low-cardinality
4. **Error Context:** Include enough context for debugging
5. **Performance:** Monitor the monitoring system itself

## Troubleshooting

### Common Issues

1. **Logs directory permissions:** Ensure write permissions
2. **High memory usage:** Check log retention settings
3. **Metrics endpoint timeout:** Verify Prometheus scrape interval
4. **WebSocket connection issues:** Check firewall settings

### Debug Commands

```bash
# Check log files
ls -la logs/

# Monitor real-time logs
tail -f logs/combined.log

# Check metrics endpoint
curl http://localhost:3000/metrics

# Check health status
curl http://localhost:3000/health | jq .
```

## Security Considerations

- Metrics endpoint doesn't require authentication (consider adding in production)
- Log files contain sensitive information (secure access)
- Health endpoint might leak internal information (consider filtering in production)
- Monitor disk usage for log files

This monitoring setup provides comprehensive operational oversight for the DeFi relayer service, enabling proactive issue detection and resolution.

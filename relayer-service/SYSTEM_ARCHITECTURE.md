# DeFi United Fusion Extension - Relayer Service Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Core Components](#core-components)
4. [Service Interactions](#service-interactions)
5. [Data Flow](#data-flow)
6. [Scalability Considerations](#scalability-considerations)
7. [Security Architecture](#security-architecture)
8. [Monitoring & Observability](#monitoring--observability)

## System Overview

The Relayer Service is a high-performance TypeScript/Node.js application designed to handle DeFi operations, particularly focused on Dutch auction orders and cross-chain settlements. The service provides real-time order management, WebSocket-based updates, and comprehensive monitoring capabilities.

### Key Features
- **Real-time Order Management**: Dutch auction order lifecycle management
- **WebSocket Support**: Live order updates and bidirectional communication
- **Cross-chain Compatibility**: Ethereum and Cardano blockchain integration
- **Escrow Monitoring**: Real-time escrow contract state tracking
- **Metrics & Monitoring**: Prometheus-compatible metrics and health checks
- **High Performance**: Designed for concurrent load and low latency

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Load Balancer / Reverse Proxy                       │
│                                    (Nginx/Traefik)                               │
└─────────────────────┬───────────────────────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────────────────────┐
│                          DeFi Relayer Service                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   HTTP Server   │  │ WebSocket Server│  │  Metrics Server │                │
│  │   (Express.js)  │  │    (ws)         │  │  (Prometheus)   │                │
│  │   Port: 3000    │  │   Port: 8081    │  │   /metrics      │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
│              │                 │                      │                         │
│  ┌───────────┴─────────────────┴──────────────────────┴───────────────────────┐ │
│  │                        Application Core                                     │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │ │
│  │  │   Orders API    │  │ Auction Monitor │  │ Price Updater   │            │ │
│  │  │   (REST)        │  │   (Real-time)   │  │   (Scheduler)   │            │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘            │ │
│  │                                                                             │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │ │
│  │  │ Escrow Monitor  │  │ Cardano Monitor │  │Cross-chain Coord│            │ │
│  │  │  (Ethereum)     │  │   (Cardano)     │  │   (Settlement)  │            │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                              │                              │
┌─────────────────────────────┴────┐              ┌─────────┴─────────────────────┐
│        Blockchain Layer          │              │      External Services        │
│  ┌─────────────────┐             │              │  ┌─────────────────┐          │
│  │   Ethereum      │             │              │  │   Alchemy API   │          │
│  │   (Sepolia)     │             │              │  │   (Blockchain)  │          │
│  └─────────────────┘             │              │  └─────────────────┘          │
│  ┌─────────────────┐             │              │  ┌─────────────────┐          │
│  │   Cardano       │             │              │  │  Ogmios WebSocket│          │
│  │   (Testnet)     │             │              │  │   (Cardano Node) │          │
│  └─────────────────┘             │              │  └─────────────────┘          │
└──────────────────────────────────┘              └────────────────────────────────┘
```

## Core Components

### 1. HTTP Server (Express.js)
**Purpose**: Main REST API server handling order management and system operations.

**Key Responsibilities**:
- Order CRUD operations
- Health check endpoint
- Metrics exposure
- Error handling and validation
- CORS and security middleware

**Endpoints**:
- `/health` - System health and status
- `/api/orders/*` - Order management
- `/api/escrow/*` - Escrow monitoring
- `/metrics` - Prometheus metrics

### 2. WebSocket Server
**Purpose**: Real-time communication for order updates and client notifications.

**Key Features**:
- Bidirectional communication
- Order update broadcasting
- Heartbeat/keepalive mechanism
- Connection management
- Event-driven architecture

**Message Types**:
- `order_created` - New order notifications
- `order_updated` - Order status changes
- `price_update` - Real-time price updates
- `heartbeat` - Connection health checks

### 3. Order Management System
**Purpose**: Core business logic for Dutch auction orders.

**Components**:
- **OrdersRoutes**: REST API handlers
- **AuctionCalculator**: Price calculation engine
- **AuctionMonitor**: Real-time order monitoring

**Features**:
- Dutch auction price decay
- Order lifecycle management
- Profitability calculations
- Filtering and pagination
- Real-time status updates

### 4. Blockchain Monitors

#### Ethereum Escrow Monitor
**Purpose**: Monitor Ethereum escrow contracts for state changes.

**Features**:
- Real-time contract event monitoring
- State synchronization
- Webhook notifications
- Error recovery and reconnection

#### Cardano Escrow Monitor
**Purpose**: Monitor Cardano blockchain for escrow-related transactions.

**Features**:
- Ogmios WebSocket connection
- UTXO monitoring
- Transaction parsing
- State management

### 5. Cross-chain Settlement Coordinator
**Purpose**: Coordinate settlements between Ethereum and Cardano chains.

**Features**:
- Multi-chain transaction coordination
- Settlement state management
- Rollback mechanisms
- Atomic operations

### 6. Price Update Service
**Purpose**: Provide real-time price updates for active orders.

**Features**:
- Scheduled price calculations
- WebSocket broadcasting
- Configurable update intervals
- Performance optimization

### 7. Metrics and Monitoring
**Purpose**: System observability and performance monitoring.

**Metrics Collected**:
- HTTP request counters
- WebSocket connection counts
- Order processing metrics
- System resource usage
- Error rates and types

## Service Interactions

### 1. Order Creation Flow
```
Client → HTTP Server → OrdersRoutes → AuctionCalculator → WebSocket Server → All Clients
```

### 2. Real-time Price Updates
```
PriceUpdateService → AuctionCalculator → WebSocket Server → Connected Clients
```

### 3. Escrow Event Processing
```
Blockchain → EscrowMonitor → EventEmitter → OrdersRoutes → WebSocket Server
```

### 4. Cross-chain Settlement
```
SettlementCoordinator → EthereumMonitor → CardanoMonitor → OrdersRoutes → WebSocket
```

## Data Flow

### 1. Order Lifecycle
1. **Creation**: Client submits order via REST API
2. **Validation**: Server validates order parameters
3. **Storage**: Order stored in in-memory map (production would use database)
4. **Notification**: WebSocket clients notified of new order
5. **Monitoring**: AuctionMonitor tracks order for price updates
6. **Updates**: Real-time price and status updates broadcasted
7. **Settlement**: Order filled or expired, final notifications sent

### 2. Blockchain Event Processing
1. **Connection**: Service connects to blockchain nodes
2. **Subscription**: Subscribe to relevant contract events
3. **Processing**: Parse and validate incoming events
4. **State Update**: Update internal state
5. **Notification**: Broadcast updates to interested clients
6. **Persistence**: Log events for audit trail

### 3. WebSocket Communication
1. **Connection**: Client establishes WebSocket connection
2. **Authentication**: Optional authentication (not implemented in current version)
3. **Subscription**: Client subscribes to relevant order updates
4. **Broadcasting**: Server pushes updates to subscribed clients
5. **Heartbeat**: Regular heartbeat to maintain connection
6. **Cleanup**: Connection cleanup on disconnect

## Scalability Considerations

### 1. Horizontal Scaling
- **Stateless Design**: Core services are stateless (except in-memory storage)
- **Load Balancing**: Multiple instances can run behind load balancer
- **Database**: Replace in-memory storage with distributed database
- **Message Queue**: Use Redis/RabbitMQ for cross-instance communication

### 2. Performance Optimization
- **Connection Pooling**: Reuse blockchain connections
- **Caching**: Cache frequently accessed data
- **Batch Processing**: Group operations for efficiency
- **Async Operations**: Non-blocking I/O throughout

### 3. Resource Management
- **Memory Management**: Efficient data structures and cleanup
- **Connection Limits**: Limit concurrent connections
- **Rate Limiting**: Protect against abuse
- **Circuit Breakers**: Prevent cascade failures

## Security Architecture

### 1. Network Security
- **HTTPS/WSS**: Encrypted connections in production
- **CORS**: Cross-origin request protection
- **Rate Limiting**: Request throttling
- **Input Validation**: Comprehensive parameter validation

### 2. Authentication & Authorization
- **JWT Tokens**: For authenticated endpoints (not implemented)
- **API Keys**: Service-to-service authentication
- **Role-based Access**: Different permission levels

### 3. Data Protection
- **Signature Verification**: Order signature validation
- **Sanitization**: Input sanitization and output filtering
- **Logging**: Security event logging (no sensitive data)

### 4. Blockchain Security
- **Network Selection**: Use appropriate testnets/mainnets
- **Private Key Management**: Secure key storage and rotation
- **Transaction Validation**: Multi-layer validation

## Monitoring & Observability

### 1. Metrics (Prometheus)
- **System Metrics**: CPU, memory, disk usage
- **Application Metrics**: Request rates, response times
- **Business Metrics**: Order counts, success rates
- **Error Metrics**: Error rates by type and endpoint

### 2. Logging (Winston)
- **Structured Logging**: JSON format with metadata
- **Log Levels**: Error, warn, info, debug
- **Correlation IDs**: Track requests across services
- **Audit Trail**: Security and business event logging

### 3. Health Checks
- **Liveness Probe**: Basic service availability
- **Readiness Probe**: Service ready to handle requests
- **Deep Health**: Check external dependencies
- **Circuit Breaker**: Automatic failure detection

### 4. Alerting
- **Error Rate Alerts**: High error rate notifications
- **Performance Alerts**: Slow response time warnings
- **Resource Alerts**: High resource usage warnings
- **Business Alerts**: Critical business event notifications

### 5. Distributed Tracing
- **Request Tracing**: Track requests across services
- **Performance Analysis**: Identify bottlenecks
- **Error Analysis**: Root cause analysis
- **Dependency Mapping**: Service interaction visualization

## Configuration Management

### 1. Environment Variables
- **Port Configuration**: Server and WebSocket ports
- **Blockchain Configuration**: RPC URLs, contract addresses
- **Feature Flags**: Enable/disable features
- **Performance Tuning**: Timeouts, limits, intervals

### 2. Service Discovery
- **Health Check Endpoints**: For load balancer health checks
- **Service Registration**: Auto-discovery in container environments
- **Configuration Reload**: Hot configuration reloading

### 3. Deployment Configuration
- **Docker Configuration**: Container settings
- **Kubernetes Manifests**: K8s deployment specs
- **Environment Separation**: Dev, staging, production configs
- **Secret Management**: Secure secret storage and rotation

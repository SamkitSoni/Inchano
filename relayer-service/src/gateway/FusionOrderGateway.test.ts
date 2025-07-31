import FusionOrderGateway from './FusionOrderGateway';
import WebSocket from 'ws';

// Mock the @1inch/fusion-sdk
jest.mock('@1inch/fusion-sdk', () => ({
    WebSocketApi: jest.fn().mockImplementation(() => ({
        init: jest.fn(),
        onOpen: jest.fn(),
        onClose: jest.fn(),
        onError: jest.fn(),
        close: jest.fn(),
        order: {
            onOrder: jest.fn(),
            onOrderCreated: jest.fn(),
            onOrderFilled: jest.fn(),
            onOrderCancelled: jest.fn()
        },
        rpc: {
            onGetActiveOrders: jest.fn(),
            getActiveOrders: jest.fn()
        }
    })),
    NetworkEnum: {
        ETHEREUM: 'ETHEREUM'
    }
}));

// Mock winston
jest.mock('winston', () => ({
    createLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    })),
    format: {
        combine: jest.fn(),
        timestamp: jest.fn(),
        json: jest.fn()
    },
    transports: {
        Console: jest.fn(),
        File: jest.fn()
    }
}));

// Mock ws
jest.mock('ws', () => {
    const mockWebSocket = {
        on: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        terminate: jest.fn(),
        ping: jest.fn(),
        readyState: 1, // OPEN
        OPEN: 1,
        CLOSED: 3
    };

    const mockServer = {
        on: jest.fn(),
        close: jest.fn()
    };

    const mockConstructor = Object.assign(mockWebSocket, {
        Server: jest.fn(() => mockServer)
    });

    return {
        __esModule: true,
        default: mockConstructor
    };
});

describe('FusionOrderGateway', () => {
    let gateway: FusionOrderGateway;
    let mockWsServer: any;

    beforeEach(() => {
        jest.clearAllMocks();
        gateway = new FusionOrderGateway(8080);
        mockWsServer = (WebSocket as any).Server.mock.results[0].value;
    });

    afterEach(async () => {
        if (gateway) {
            await gateway.stop();
        }
    });

    describe('Construction and Initialization', () => {
        it('should create gateway instance with default port', () => {
            const defaultGateway = new FusionOrderGateway();
            expect(defaultGateway).toBeInstanceOf(FusionOrderGateway);
        });

        it('should create WebSocket server on specified port', () => {
            expect(WebSocket.Server).toHaveBeenCalledWith({ port: 8080 });
        });

        it('should initialize 1inch WebSocket API correctly', () => {
            const { WebSocketApi } = require('@1inch/fusion-sdk');
            expect(WebSocketApi).toHaveBeenCalledWith({
                url: 'wss://api.1inch.dev/fusion-plus/ws',
                network: 'ETHEREUM',
                lazyInit: true
            });
        });
    });

    describe('Gateway Lifecycle', () => {
        it('should start successfully', async () => {
            await expect(gateway.start()).resolves.not.toThrow();
        });

        it('should stop successfully', async () => {
            await gateway.start();
            await expect(gateway.stop()).resolves.not.toThrow();
        });

        it('should handle start failure gracefully', async () => {
            // Mock init to throw error
            const mockWsApi = (gateway as any).wsApi;
            mockWsApi.init.mockImplementation(() => {
                throw new Error('Connection failed');
            });

            await expect(gateway.start()).rejects.toThrow('Connection failed');
        });
    });

    describe('WebSocket Server Management', () => {
        it('should handle new resolver connections', async () => {
            await gateway.start();

            // Simulate connection event
            const connectionHandler = mockWsServer.on.mock.calls.find(
                (call: any[]) => call[0] === 'connection'
            )[1];

            const mockWs = {
                on: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN
            };

            const mockRequest = {
                socket: { remoteAddress: '127.0.0.1' }
            };

            connectionHandler(mockWs, mockRequest);

            expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
            expect(mockWs.on).toHaveBeenCalledWith('pong', expect.any(Function));
            expect(mockWs.send).toHaveBeenCalledWith(
                expect.stringContaining('welcome')
            );
        });

        it('should handle resolver disconnection', async () => {
            await gateway.start();

            const connectionHandler = mockWsServer.on.mock.calls.find(
                (call: any[]) => call[0] === 'connection'
            )[1];

            const mockWs = {
                on: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN
            };

            connectionHandler(mockWs, { socket: { remoteAddress: '127.0.0.1' } });

            // Simulate close event
            const closeHandler = mockWs.on.mock.calls.find(
                call => call[0] === 'close'
            )[1];

            expect(() => closeHandler()).not.toThrow();
        });

        it('should handle resolver messages correctly', async () => {
            await gateway.start();

            const connectionHandler = mockWsServer.on.mock.calls.find(
                (call: any[]) => call[0] === 'connection'
            )[1];

            const mockWs = {
                on: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN
            };

            connectionHandler(mockWs, { socket: { remoteAddress: '127.0.0.1' } });

            // Simulate message event
            const messageHandler = mockWs.on.mock.calls.find(
                call => call[0] === 'message'
            )[1];

            const pingMessage = Buffer.from(JSON.stringify({ type: 'ping' }));
            messageHandler(pingMessage);

            expect(mockWs.send).toHaveBeenCalledWith(
                expect.stringContaining('pong')
            );
        });

        it('should handle invalid JSON messages gracefully', async () => {
            await gateway.start();

            const connectionHandler = mockWsServer.on.mock.calls.find(
                (call: any[]) => call[0] === 'connection'
            )[1];

            const mockWs = {
                on: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN
            };

            connectionHandler(mockWs, { socket: { remoteAddress: '127.0.0.1' } });

            const messageHandler = mockWs.on.mock.calls.find(
                call => call[0] === 'message'
            )[1];

            const invalidMessage = Buffer.from('invalid json');
            expect(() => messageHandler(invalidMessage)).not.toThrow();
        });
    });

    describe('Order Event Handling', () => {
        it('should process order events from 1inch WebSocket', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const orderHandler = mockWsApi.order.onOrder.mock.calls[0][0];

            const mockOrderEvent = {
                event: 'order_created',
                result: {
                    orderHash: '0x123',
                    order: {
                        maker: '0xabc',
                        makingAmount: '1000'
                    }
                }
            };

            expect(() => orderHandler(mockOrderEvent)).not.toThrow();
        });

        it('should handle order created events', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const createdHandler = mockWsApi.order.onOrderCreated.mock.calls[0][0];

            const mockOrderEvent = {
                event: 'order_created',
                result: {
                    orderHash: '0x123'
                }
            };

            expect(() => createdHandler(mockOrderEvent)).not.toThrow();
        });

        it('should handle order filled events', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const filledHandler = mockWsApi.order.onOrderFilled.mock.calls[0][0];

            const mockOrderEvent = {
                event: 'order_filled',
                result: {
                    orderHash: '0x123'
                }
            };

            expect(() => filledHandler(mockOrderEvent)).not.toThrow();
        });

        it('should handle order cancelled events', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const cancelledHandler = mockWsApi.order.onOrderCancelled.mock.calls[0][0];

            const mockOrderEvent = {
                event: 'order_cancelled',
                result: {
                    orderHash: '0x123'
                }
            };

            expect(() => cancelledHandler(mockOrderEvent)).not.toThrow();
        });
    });

    describe('Connection Management', () => {
        it('should handle WebSocket connection opened', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const openHandler = mockWsApi.onOpen.mock.calls[0][0];

            expect(() => openHandler()).not.toThrow();
            expect((gateway as any).isConnected).toBe(true);
        });

        it('should handle WebSocket connection closed', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const closeHandler = mockWsApi.onClose.mock.calls[0][0];

            expect(() => closeHandler()).not.toThrow();
            expect((gateway as any).isConnected).toBe(false);
        });

        it('should handle WebSocket errors', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const errorHandler = mockWsApi.onError.mock.calls[0][0];

            const mockError = new Error('Connection error');
            expect(() => errorHandler(mockError)).not.toThrow();
            expect((gateway as any).isConnected).toBe(false);
        });

        it('should attempt reconnection after connection loss', async () => {
            await gateway.start();

            const mockWsApi = (gateway as any).wsApi;
            const closeHandler = mockWsApi.onClose.mock.calls[0][0];

            // Simulate connection close
            closeHandler();

            // Wait for reconnection attempt (exponential backoff: 2000ms for first attempt)
            await new Promise(resolve => setTimeout(resolve, 2500));

            expect(mockWsApi.init).toHaveBeenCalledTimes(2); // Initial + reconnect
        });

        it('should stop reconnection attempts after max retries', async () => {
            await gateway.start();

            const gateway_internal = gateway as any;
            gateway_internal.maxReconnectAttempts = 2;
            gateway_internal.reconnectAttempts = 2;

            const mockWsApi = gateway_internal.wsApi;
            const closeHandler = mockWsApi.onClose.mock.calls[0][0];

            closeHandler();

            // Should not attempt reconnection
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockWsApi.init).toHaveBeenCalledTimes(1); // Only initial call
        });
    });

    describe('Broadcasting Functionality', () => {
        it('should broadcast messages to all connected resolvers', async () => {
            await gateway.start();

            // Add mock resolvers
            const mockResolver1 = {
                id: 'resolver1',
                ws: { 
                    send: jest.fn(), 
                    close: jest.fn(),
                    ping: jest.fn(),
                    terminate: jest.fn(),
                    readyState: WebSocket.OPEN 
                },
                isAlive: true,
                lastSeen: new Date()
            };

            const mockResolver2 = {
                id: 'resolver2',
                ws: { 
                    send: jest.fn(), 
                    close: jest.fn(),
                    ping: jest.fn(),
                    terminate: jest.fn(),
                    readyState: WebSocket.OPEN 
                },
                isAlive: true,
                lastSeen: new Date()
            };

            (gateway as any).resolvers.set('resolver1', mockResolver1);
            (gateway as any).resolvers.set('resolver2', mockResolver2);

            // Trigger broadcast
            const message = {
                type: 'test_message',
                timestamp: new Date(),
                data: { test: 'data' }
            };

            (gateway as any).broadcastToResolvers(message);

            expect(mockResolver1.ws.send).toHaveBeenCalledWith(JSON.stringify(message));
            expect(mockResolver2.ws.send).toHaveBeenCalledWith(JSON.stringify(message));
        });

        it('should handle broadcasting to closed connections gracefully', async () => {
            await gateway.start();

            const mockResolver = {
                id: 'resolver1',
                ws: { 
                    send: jest.fn(), 
                    close: jest.fn(),
                    ping: jest.fn(),
                    terminate: jest.fn(),
                    readyState: WebSocket.CLOSED 
                },
                isAlive: true,
                lastSeen: new Date()
            };

            (gateway as any).resolvers.set('resolver1', mockResolver);

            const message = {
                type: 'test_message',
                timestamp: new Date(),
                data: { test: 'data' }
            };

            expect(() => (gateway as any).broadcastToResolvers(message)).not.toThrow();
            expect(mockResolver.ws.send).not.toHaveBeenCalled();
        });
    });

    describe('Heartbeat and Health Monitoring', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should start heartbeat monitoring', async () => {
            await gateway.start();

            const mockResolver = {
                id: 'resolver1',
                ws: { 
                    ping: jest.fn(), 
                    terminate: jest.fn(), 
                    close: jest.fn(),
                    send: jest.fn(),
                    readyState: WebSocket.OPEN 
                },
                isAlive: true,
                lastSeen: new Date()
            };

            (gateway as any).resolvers.set('resolver1', mockResolver);

            // Fast forward 30 seconds
            jest.advanceTimersByTime(30000);

            expect(mockResolver.ws.ping).toHaveBeenCalled();
            expect(mockResolver.isAlive).toBe(false);
        });

        it('should remove inactive resolvers', async () => {
            await gateway.start();

            const mockResolver = {
                id: 'resolver1',
                ws: { 
                    ping: jest.fn(), 
                    terminate: jest.fn(), 
                    close: jest.fn(),
                    send: jest.fn(),
                    readyState: WebSocket.OPEN 
                },
                isAlive: false, // Already marked as inactive
                lastSeen: new Date()
            };

            (gateway as any).resolvers.set('resolver1', mockResolver);

            jest.advanceTimersByTime(30000);

            expect(mockResolver.ws.terminate).toHaveBeenCalled();
            expect((gateway as any).resolvers.has('resolver1')).toBe(false);
        });
    });

    describe('Status and Monitoring', () => {
        it('should return correct status information', async () => {
            await gateway.start();

            const status = gateway.getStatus();

            expect(status).toHaveProperty('isConnected');
            expect(status).toHaveProperty('reconnectAttempts');
            expect(status).toHaveProperty('connectedResolvers');
            expect(status).toHaveProperty('resolvers');
        });

        it('should track resolver connections in status', async () => {
            await gateway.start();

            const mockResolver = {
                id: 'resolver1',
                ws: { 
                    readyState: WebSocket.OPEN,
                    close: jest.fn(),
                    ping: jest.fn(),
                    terminate: jest.fn(),
                    send: jest.fn()
                },
                isAlive: true,
                lastSeen: new Date()
            };

            (gateway as any).resolvers.set('resolver1', mockResolver);

            const status = gateway.getStatus() as any;
            expect(status.connectedResolvers).toBe(1);
            expect(status.resolvers).toHaveLength(1);
            expect(status.resolvers[0].id).toBe('resolver1');
        });
    });

    describe('Error Handling', () => {
        it('should handle JSON parsing errors in resolver messages', async () => {
            await gateway.start();

            const connectionHandler = mockWsServer.on.mock.calls.find(
                (call: any[]) => call[0] === 'connection'
            )[1];

            const mockWs = {
                on: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN
            };

            connectionHandler(mockWs, { socket: { remoteAddress: '127.0.0.1' } });

            const messageHandler = mockWs.on.mock.calls.find(
                call => call[0] === 'message'
            )[1];

            // Send invalid JSON
            const invalidMessage = Buffer.from('not valid json');
            expect(() => messageHandler(invalidMessage)).not.toThrow();
        });

        it('should handle WebSocket send errors gracefully', async () => {
            await gateway.start();

            const mockResolver = {
                id: 'resolver1',
                ws: {
                    send: jest.fn().mockImplementation(() => {
                        throw new Error('Send failed');
                    }),
                    close: jest.fn(),
                    ping: jest.fn(),
                    terminate: jest.fn(),
                    readyState: WebSocket.OPEN
                },
                isAlive: true,
                lastSeen: new Date()
            };

            (gateway as any).resolvers.set('resolver1', mockResolver);

            const message = {
                type: 'test_message',
                timestamp: new Date(),
                data: { test: 'data' }
            };

            expect(() => (gateway as any).broadcastToResolvers(message)).not.toThrow();
        });
    });
});

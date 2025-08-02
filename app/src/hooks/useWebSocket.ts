import { useState, useEffect, useRef, useCallback } from 'react';
import { relayerApi, WebSocketMessage, OrderUpdateEvent, ProfitableOpportunityEvent } from '@/lib/api';

interface UseWebSocketOptions {
  onOrderCreated?: (orderHash: string, order: any) => void;
  onOrderUpdated?: (event: OrderUpdateEvent) => void;
  onOrderFilled?: (orderHash: string, order: any) => void;
  onOrderCancelled?: (orderHash: string, order: any) => void;
  onProfitableOpportunity?: (event: ProfitableOpportunityEvent) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    try {
      ws.current = relayerApi.createWebSocketConnection();
      
      ws.current.onopen = () => {
        console.log('Connected to relayer WebSocket');
        setIsConnected(true);
        setConnectionError(null);
        
        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Send ping every 30 seconds
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          
          // Handle different message types
          switch (message.type) {
            case 'welcome':
              console.log('WebSocket welcome message received');
              break;
              
            case 'order_created':
              if (options.onOrderCreated && message.data) {
                options.onOrderCreated(message.data.orderHash, message.data.order);
              }
              break;
              
            case 'order_updated':
              if (options.onOrderUpdated && message.data) {
                options.onOrderUpdated(message.data as OrderUpdateEvent);
              }
              break;
              
            case 'order_filled':
              if (options.onOrderFilled && message.data) {
                options.onOrderFilled(message.data.orderHash, message.data.order);
              }
              break;
              
            case 'order_cancelled':
              if (options.onOrderCancelled && message.data) {
                options.onOrderCancelled(message.data.orderHash, message.data.order);
              }
              break;
              
            case 'profitable_opportunity':
              if (options.onProfitableOpportunity && message.data) {
                options.onProfitableOpportunity(message.data as ProfitableOpportunityEvent);
              }
              break;
              
            case 'heartbeat':
              // Handle heartbeat/pong response
              break;
              
            default:
              console.log('Unknown WebSocket message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        setIsConnected(false);
        
        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // Attempt to reconnect after 3 seconds if not a clean close
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('WebSocket connection error');
      };
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError('Failed to create WebSocket connection');
    }
  }, [options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    
    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect');
      ws.current = null;
    }
    
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    connectionError,
    lastMessage,
    sendMessage,
    connect,
    disconnect
  };
}

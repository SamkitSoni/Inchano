'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface AuctionUpdate {
  auctionId: string
  currentPrice: number
  progress: number
  timeRemaining: number
  status: 'running' | 'paused' | 'completed' | 'cancelled'
  timestamp: number
}

export interface RelayerBid {
  relayerId: string
  bidPrice: number
  timestamp: number
  auctionId: string
}

interface AuctionWebSocketConfig {
  url?: string
  reconnectAttempts?: number
  reconnectInterval?: number
  simulate?: boolean
}

interface UseAuctionWebSocketProps {
  auctionId?: string
  config?: AuctionWebSocketConfig
  onAuctionUpdate?: (update: AuctionUpdate) => void
  onRelayerBid?: (bid: RelayerBid) => void
  onConnectionChange?: (connected: boolean) => void
  onError?: (error: Error) => void
}

export function useAuctionWebSocket({
  auctionId,
  config = {},
  onAuctionUpdate,
  onRelayerBid,
  onConnectionChange,
  onError
}: UseAuctionWebSocketProps) {
  const {
    url = 'ws://localhost:8080/auction',
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    simulate = true // Default to simulation mode for demo
  } = config

  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const [lastUpdate, setLastUpdate] = useState<AuctionUpdate | null>(null)
  const [activeBids, setActiveBids] = useState<RelayerBid[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectCountRef = useRef(0)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
    }
    
    heartbeatIntervalRef.current = setInterval(() => {
      if (simulate) {
        // Simulated heartbeat - just log
        console.log('💓 Simulated heartbeat')
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000) // Ping every 30 seconds
  }, [simulate])

  const connect = useCallback(() => {
    cleanup()
    setConnectionStatus('connecting')

    // Simulation mode for demo
    if (simulate) {
      console.log('🔗 Auction WebSocket connecting (simulation mode)')
      
      // Simulate connection delay
      setTimeout(() => {
        console.log('🔗 Auction WebSocket connected (simulated)')
        setIsConnected(true)
        setConnectionStatus('connected')
        reconnectCountRef.current = 0
        onConnectionChange?.(true)
        
        // Start simulated heartbeat
        startHeartbeat()
      }, 500)
      
      return
    }

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('🔗 Auction WebSocket connected')
        setIsConnected(true)
        setConnectionStatus('connected')
        reconnectCountRef.current = 0
        onConnectionChange?.(true)
        startHeartbeat()

        // Subscribe to auction updates if auctionId is provided
        if (auctionId) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            auctionId
          }))
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          switch (data.type) {
            case 'auction_update':
              const update: AuctionUpdate = data.payload
              setLastUpdate(update)
              onAuctionUpdate?.(update)
              break
              
            case 'relayer_bid':
              const bid: RelayerBid = data.payload
              setActiveBids(prev => {
                // Keep only the latest bid from each relayer
                const filtered = prev.filter(b => b.relayerId !== bid.relayerId)
                return [...filtered, bid].sort((a, b) => b.timestamp - a.timestamp)
              })
              onRelayerBid?.(bid)
              break
              
            case 'pong':
              // Heartbeat response
              break
              
            default:
              console.log('📨 Unknown message type:', data.type)
          }
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err)
        }
      }

      ws.onclose = (event) => {
        console.log('🔌 Auction WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        setConnectionStatus('disconnected')
        onConnectionChange?.(false)

        // Attempt to reconnect if not a manual close
        if (event.code !== 1000 && reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++
          console.log(`🔄 Attempting to reconnect (${reconnectCountRef.current}/${reconnectAttempts})...`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, reconnectInterval)
        }
      }

      ws.onerror = (error) => {
        console.error('❌ Auction WebSocket error:', error)
        setConnectionStatus('error')
        onError?.(new Error('WebSocket connection failed'))
      }

    } catch (err) {
      console.error('❌ Failed to create WebSocket:', err)
      setConnectionStatus('error')
      onError?.(err as Error)
    }
  }, [url, auctionId, reconnectAttempts, reconnectInterval, simulate, onConnectionChange, onAuctionUpdate, onRelayerBid, onError, cleanup, startHeartbeat])

  // Broadcast auction update to relayers
  const broadcastAuctionUpdate = useCallback((update: AuctionUpdate) => {
    if (simulate) {
      console.log('📡 Broadcasting auction update (simulated):', update)
      // In simulation mode, just log the broadcast
      return
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'broadcast_auction_update',
        payload: update
      }))
    }
  }, [simulate])

  // Submit a bid (for relayers)
  const submitBid = useCallback((bidPrice: number, relayerId: string) => {
    if (auctionId) {
      const bid: RelayerBid = {
        relayerId,
        bidPrice,
        timestamp: Date.now(),
        auctionId
      }
      
      if (simulate) {
        console.log('📤 Submitting bid (simulated):', bid)
        // In simulation mode, add the bid locally
        setActiveBids(prev => {
          const filtered = prev.filter(b => b.relayerId !== bid.relayerId)
          return [...filtered, bid].sort((a, b) => b.timestamp - a.timestamp)
        })
        return bid
      }
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'submit_bid',
          payload: bid
        }))
      }
      
      return bid
    }
    return null
  }, [auctionId, simulate])

  // Subscribe to a different auction
  const subscribeToAuction = useCallback((newAuctionId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        auctionId: newAuctionId
      }))
    }
  }, [])

  // Unsubscribe from current auction
  const unsubscribeFromAuction = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && auctionId) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        auctionId
      }))
    }
  }, [auctionId])

  // Connect on mount or when auctionId changes
  useEffect(() => {
    if (auctionId) {
      connect()
    }
    
    return cleanup
  }, [auctionId, connect, cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    // Connection state
    isConnected,
    connectionStatus,
    
    // Data
    lastUpdate,
    activeBids,
    
    // Actions
    connect,
    disconnect: cleanup,
    broadcastAuctionUpdate,
    submitBid,
    subscribeToAuction,
    unsubscribeFromAuction,
    
    // Connection stats
    reconnectCount: reconnectCountRef.current
  }
}

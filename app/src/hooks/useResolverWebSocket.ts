'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Types for resolver WebSocket communication
export interface ResolverOrder {
  id: string
  fromToken: string
  toToken: string
  fromAmount: string
  toAmount: string
  fromChain: 'ethereum' | 'cardano'
  toChain: 'ethereum' | 'cardano'
  status: 'pending' | 'accepted' | 'in_escrow' | 'completed' | 'cancelled'
  maker: string
  receiver: string
  timestamp: Date
  auctionPrice?: number
  auctionId?: string
  escrowStatus?: 'none' | 'creating' | 'deposited' | 'withdrawing' | 'completed'
}

export interface ResolverAuction {
  id: string
  fromToken: string
  toToken: string
  fromAmount: string
  currentPrice: number
  startPrice: number
  endPrice: number
  progress: number
  timeRemaining: number
  totalDuration: number
  maker: string
  receiver: string
  status: 'running' | 'paused' | 'completed' | 'cancelled'
}

export interface EscrowUpdate {
  orderId: string
  action: 'create' | 'deposit' | 'withdraw' | 'cancel'
  status: 'pending' | 'success' | 'failed'
  txHash?: string
  timestamp: number
}

interface UseResolverWebSocketProps {
  onOrderUpdate?: (order: ResolverOrder) => void
  onAuctionUpdate?: (auction: ResolverAuction) => void
  onEscrowUpdate?: (update: EscrowUpdate) => void
  onConnectionChange?: (connected: boolean) => void
  onError?: (error: string) => void
}

interface UseResolverWebSocketReturn {
  isConnected: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  orders: ResolverOrder[]
  auctions: ResolverAuction[]
  lastUpdate: any
  acceptAuction: (auctionId: string, price: number) => Promise<void>
  updateEscrow: (orderId: string, action: 'create' | 'deposit' | 'withdraw' | 'cancel') => Promise<void>
  refreshData: () => void
  connect: () => void
  disconnect: () => void
}

export function useResolverWebSocket({
  onOrderUpdate,
  onAuctionUpdate,
  onEscrowUpdate,
  onConnectionChange,
  onError
}: UseResolverWebSocketProps = {}): UseResolverWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const [orders, setOrders] = useState<ResolverOrder[]>([])
  const [auctions, setAuctions] = useState<ResolverAuction[]>([])
  const [lastUpdate, setLastUpdate] = useState<any>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const eventCleanupRef = useRef<(() => void) | null>(null)

  const maxReconnectAttempts = 5
  const reconnectDelay = 3000

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setConnectionStatus('connecting')
    
    try {
      // In a real implementation, this would connect to your resolver WebSocket endpoint
      // For now, we'll simulate the connection
      console.log('🔌 Connecting to resolver WebSocket...')
      
      // Simulate connection after delay
      setTimeout(() => {
        setIsConnected(true)
        setConnectionStatus('connected')
        reconnectAttempts.current = 0
        onConnectionChange?.(true)
        
        console.log('✅ Resolver WebSocket connected')
        
        // Simulate receiving initial data
        setTimeout(() => {
          simulateInitialData()
          
          // Listen for auction events from Dutch auction component
          const handleAuctionStarted = (event: CustomEvent) => {
            const auctionData = event.detail
            setAuctions(prev => {
              // Remove any existing auction with same ID and add new one
              const filtered = prev.filter(a => a.id !== auctionData.id)
              return [...filtered, auctionData]
            })
            onAuctionUpdate?.(auctionData)
            console.log('📡 Resolver received new auction:', auctionData.id)
          }
          
          const handleAuctionUpdated = (event: CustomEvent) => {
            const auctionData = event.detail
            setAuctions(prev => {
              return prev.map(auction => 
                auction.id === auctionData.id ? auctionData : auction
              )
            })
            onAuctionUpdate?.(auctionData)
          }
          
          const handleAuctionCompleted = (event: CustomEvent) => {
            const { auctionId } = event.detail
            setAuctions(prev => prev.filter(a => a.id !== auctionId))
            console.log('🏁 Resolver: Auction completed:', auctionId)
          }
          
          const handleAuctionStopped = (event: CustomEvent) => {
            const { auctionId } = event.detail
            setAuctions(prev => prev.filter(a => a.id !== auctionId))
            console.log('🛑 Resolver: Auction stopped:', auctionId)
          }
          
          // Add event listeners
          window.addEventListener('auctionStarted', handleAuctionStarted as EventListener)
          window.addEventListener('auctionUpdated', handleAuctionUpdated as EventListener)
          window.addEventListener('auctionCompleted', handleAuctionCompleted as EventListener)
          window.addEventListener('auctionStopped', handleAuctionStopped as EventListener)
          
          // Store cleanup function
          eventCleanupRef.current = () => {
            window.removeEventListener('auctionStarted', handleAuctionStarted as EventListener)
            window.removeEventListener('auctionUpdated', handleAuctionUpdated as EventListener)
            window.removeEventListener('auctionCompleted', handleAuctionCompleted as EventListener)
            window.removeEventListener('auctionStopped', handleAuctionStopped as EventListener)
          }
        }, 1000)
        
        // Start simulating real-time updates
        startSimulation()
      }, 1000)
      
    } catch (error) {
      console.error('❌ Resolver WebSocket connection failed:', error)
      setConnectionStatus('error')
      onError?.('Connection failed')
      scheduleReconnect()
    }
  }, [onConnectionChange, onError])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    // Clean up event listeners
    if (eventCleanupRef.current) {
      eventCleanupRef.current()
      eventCleanupRef.current = null
    }
    
    setIsConnected(false)
    setConnectionStatus('disconnected')
    onConnectionChange?.(false)
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [onConnectionChange])

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts.current < maxReconnectAttempts) {
      reconnectAttempts.current++
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log(`🔄 Reconnecting... Attempt ${reconnectAttempts.current}`)
        connect()
      }, reconnectDelay)
    } else {
      console.error('❌ Max reconnection attempts reached')
      setConnectionStatus('error')
      onError?.('Max reconnection attempts reached')
    }
  }, [connect, onError])

  const simulateInitialData = () => {
    // Start with empty auction list - no mock data
    setAuctions([])
    
    // Check for existing active auction in localStorage
    const existingAuction = localStorage.getItem('active_auction')
    if (existingAuction) {
      try {
        const auctionData = JSON.parse(existingAuction)
        setAuctions([auctionData])
        onAuctionUpdate?.(auctionData)
      } catch (error) {
        console.error('Error parsing existing auction data:', error)
      }
    }
  }

  const startSimulation = () => {
    // Simulate auction price updates every 5 seconds
    const interval = setInterval(() => {
      if (!isConnected) {
        clearInterval(interval)
        return
      }

      setAuctions(prevAuctions => 
        prevAuctions.map(auction => {
          if (auction.status === 'running') {
            const newProgress = Math.min(auction.progress + 0.05, 1)
            const priceRange = auction.startPrice - auction.endPrice
            const newPrice = auction.startPrice - (priceRange * newProgress)
            const newTimeRemaining = Math.max(auction.timeRemaining - 5, 0)

            const updatedAuction = {
              ...auction,
              currentPrice: newPrice,
              progress: newProgress,
              timeRemaining: newTimeRemaining,
              status: newTimeRemaining === 0 ? 'completed' as const : auction.status
            }

            onAuctionUpdate?.(updatedAuction)
            return updatedAuction
          }
          return auction
        })
      )
    }, 5000)

    return () => clearInterval(interval)
  }

  const acceptAuction = useCallback(async (auctionId: string, price: number) => {
    if (!isConnected) {
      throw new Error('Not connected to WebSocket')
    }

    console.log(`🎯 Accepting auction ${auctionId} at price ${price}`)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Convert auction to order
    const auction = auctions.find(a => a.id === auctionId)
    if (auction) {
      const newOrder: ResolverOrder = {
        id: `order-${Date.now()}`,
        fromToken: auction.fromToken,
        toToken: auction.toToken,
        fromAmount: auction.fromAmount,
        toAmount: (parseFloat(auction.fromAmount) * price).toFixed(6),
        fromChain: auction.fromToken === 'ADA' ? 'cardano' : 'ethereum',
        toChain: auction.toToken === 'ADA' ? 'cardano' : 'ethereum',
        status: 'accepted',
        maker: auction.maker,
        receiver: auction.receiver,
        timestamp: new Date(),
        auctionPrice: price,
        auctionId: auctionId,
        escrowStatus: 'none'
      }

      setOrders(prev => [newOrder, ...prev])
      setAuctions(prev => prev.filter(a => a.id !== auctionId))
      onOrderUpdate?.(newOrder)
    }
  }, [isConnected, auctions, onOrderUpdate])

  const updateEscrow = useCallback(async (orderId: string, action: 'create' | 'deposit' | 'withdraw' | 'cancel') => {
    if (!isConnected) {
      throw new Error('Not connected to WebSocket')
    }

    console.log(`🏦 Updating escrow: ${action} for order ${orderId}`)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const escrowUpdate: EscrowUpdate = {
      orderId,
      action,
      status: 'success',
      txHash: `0x${Math.random().toString(16).slice(2, 10)}...`,
      timestamp: Date.now()
    }

    onEscrowUpdate?.(escrowUpdate)

    // Update local state
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        switch (action) {
          case 'create':
            return { ...order, escrowStatus: 'creating' }
          case 'deposit':
            return { ...order, status: 'in_escrow', escrowStatus: 'deposited' }
          case 'withdraw':
            return { ...order, status: 'completed', escrowStatus: 'completed' }
          case 'cancel':
            return { ...order, status: 'cancelled', escrowStatus: 'completed' }
          default:
            return order
        }
      }
      return order
    }))
  }, [isConnected, onEscrowUpdate])

  const refreshData = useCallback(() => {
    if (isConnected) {
      console.log('🔄 Refreshing resolver data...')
      simulateInitialData()
    }
  }, [isConnected])

  // Auto-connect on mount
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  // Update last update timestamp
  useEffect(() => {
    setLastUpdate({
      timestamp: Date.now(),
      ordersCount: orders.length,
      auctionsCount: auctions.length
    })
  }, [orders.length, auctions.length])

  return {
    isConnected,
    connectionStatus,
    orders,
    auctions,
    lastUpdate,
    acceptAuction,
    updateEscrow,
    refreshData,
    connect,
    disconnect
  }
}

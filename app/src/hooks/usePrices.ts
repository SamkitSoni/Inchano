import { useState, useCallback, useRef, useEffect } from "react"

// Types
export interface TokenPrices {
  ETH: number
  ADA: number
  USDC: number
}

export interface SwapPrices {
  fromPrice: number
  toPrice: number
  exchangeRate: number
  fromSymbol: string
  toSymbol: string
}

// Constants
const PRICE_UPDATE_INTERVAL = 60000 // 1 minute in milliseconds
const MIN_REQUEST_INTERVAL = 10000 // 10 seconds minimum between requests

// Singleton price manager to prevent excessive API calls
class PriceManager {
  private static instance: PriceManager | null = null
  private prices: TokenPrices = { ETH: 0, ADA: 0, USDC: 0 }
  private loading = false
  private error: string | null = null
  private lastUpdated: Date | null = null
  private lastRequestTime = 0
  private fetchPromise: Promise<void> | null = null
  private subscribers = new Set<() => void>()
  private interval: NodeJS.Timeout | null = null

  static getInstance(): PriceManager {
    if (!PriceManager.instance) {
      PriceManager.instance = new PriceManager()
    }
    return PriceManager.instance
  }

  subscribe(callback: () => void) {
    this.subscribers.add(callback)
    
    // Start fetching when first subscriber is added
    if (this.subscribers.size === 1) {
      this.startFetching()
    }
    
    return () => {
      this.subscribers.delete(callback)
      // Stop fetching when no subscribers left
      if (this.subscribers.size === 0) {
        this.stopFetching()
      }
    }
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => callback())
  }

  private startFetching() {
    // Initial fetch
    this.fetchPrices()
    
    // Set up interval
    this.interval = setInterval(() => {
      this.fetchPrices()
    }, PRICE_UPDATE_INTERVAL)
  }

  private stopFetching() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  async fetchPrices(force = false): Promise<void> {
    const now = Date.now()
    
    // Rate limiting: prevent requests more frequent than MIN_REQUEST_INTERVAL
    if (!force && now - this.lastRequestTime < MIN_REQUEST_INTERVAL) {
      return
    }

    // If there is already a fetch in progress, return the existing promise
    if (this.fetchPromise) {
      return this.fetchPromise
    }

    this.fetchPromise = this.performFetch()
    
    try {
      await this.fetchPromise
    } finally {
      this.fetchPromise = null
    }
  }

  private async performFetch(): Promise<void> {
    try {
      this.loading = true
      this.error = null
      this.lastRequestTime = Date.now()
      this.notifySubscribers()

      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,cardano,usd-coin&vs_currencies=usd",
        {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      this.prices = {
        ETH: data.ethereum?.usd || 0,
        ADA: data.cardano?.usd || 0,
        USDC: data["usd-coin"]?.usd || 0,
      }
      
      this.lastUpdated = new Date()
      this.error = null
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to fetch prices"
      console.error("Price fetch error:", err)
    } finally {
      this.loading = false
      this.notifySubscribers()
    }
  }

  getPrices(): TokenPrices {
    return { ...this.prices }
  }

  getLoading(): boolean {
    return this.loading
  }

  getError(): string | null {
    return this.error
  }

  getLastUpdated(): Date | null {
    return this.lastUpdated
  }
}

// Hook to use the price manager
export const usePrices = () => {
  const managerRef = useRef<PriceManager>()
  const [prices, setPrices] = useState<TokenPrices>({ ETH: 0, ADA: 0, USDC: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Initialize manager
  if (!managerRef.current) {
    managerRef.current = PriceManager.getInstance()
  }

  const updateState = useCallback(() => {
    const manager = managerRef.current!
    setPrices(manager.getPrices())
    setLoading(manager.getLoading())
    setError(manager.getError())
    setLastUpdated(manager.getLastUpdated())
  }, [])

  useEffect(() => {
    const manager = managerRef.current!
    
    // Initialize state
    updateState()
    
    // Subscribe to updates
    const unsubscribe = manager.subscribe(updateState)
    
    return unsubscribe
  }, [updateState])

  // Calculate exchange rate and price info for a specific swap pair
  const getSwapPrices = useCallback((fromSymbol: string, toSymbol: string): SwapPrices => {
    const fromPrice = prices[fromSymbol as keyof TokenPrices] || 0
    const toPrice = prices[toSymbol as keyof TokenPrices] || 0
    const exchangeRate = fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 0

    return {
      fromPrice,
      toPrice,
      exchangeRate,
      fromSymbol,
      toSymbol
    }
  }, [prices])

  // Get market price for specific conversion (e.g., 1 ADA in ETH)
  const getMarketPrice = useCallback((fromSymbol: string, toSymbol: string): number => {
    const fromPrice = prices[fromSymbol as keyof TokenPrices] || 0
    const toPrice = prices[toSymbol as keyof TokenPrices] || 0
    return fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 0
  }, [prices])

  // Get market price for 1 ETH in ADA for display
  const getMarketPriceEthToAda = useCallback((): number => {
    return getMarketPrice("ETH", "ADA")
  }, [getMarketPrice])

  // Get market price for 1 ADA in ETH for display 
  const getMarketPriceAdaToEth = useCallback((): number => {
    return getMarketPrice("ADA", "ETH")
  }, [getMarketPrice])

  // Calculate output amount for a swap
  const calculateOutputAmount = useCallback((
    inputAmount: string,
    fromSymbol: string,
    toSymbol: string
  ): string => {
    const amount = parseFloat(inputAmount)
    if (isNaN(amount) || amount <= 0) return ""

    const fromPrice = prices[fromSymbol as keyof TokenPrices] || 0
    const toPrice = prices[toSymbol as keyof TokenPrices] || 0
    const exchangeRate = fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 0
    
    if (exchangeRate <= 0) return ""

    const outputAmount = amount * exchangeRate
    return outputAmount.toFixed(6) // 6 decimal places for precision
  }, [prices])

  // Format price for display
  const formatPrice = useCallback((price: number): string => {
    if (price >= 1) {
      return `$${price.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`
    } else {
      return `$${price.toFixed(6)}`
    }
  }, [])

  // Format exchange rate for display
  const formatExchangeRate = useCallback((fromSymbol: string, toSymbol: string): string => {
    const fromPrice = prices[fromSymbol as keyof TokenPrices] || 0
    const toPrice = prices[toSymbol as keyof TokenPrices] || 0
    const exchangeRate = fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 0
    
    if (exchangeRate <= 0) return "N/A"

    if (exchangeRate >= 1) {
      return `1 ${fromSymbol} ≈ ${exchangeRate.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })} ${toSymbol}`
    } else {
      return `1 ${fromSymbol} ≈ ${exchangeRate.toFixed(6)} ${toSymbol}`
    }
  }, [prices])

  // Get market price display text
  const getMarketPriceText = useCallback((fromSymbol: string, toSymbol: string): string => {
    const fromPrice = prices[fromSymbol as keyof TokenPrices] || 0
    const toPrice = prices[toSymbol as keyof TokenPrices] || 0
    const exchangeRate = fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 0
    
    if (exchangeRate <= 0) return "Market price: N/A"

    if (exchangeRate >= 1) {
      return `Market: 1 ${fromSymbol} = ${exchangeRate.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })} ${toSymbol}`
    } else {
      return `Market: 1 ${fromSymbol} = ${exchangeRate.toFixed(6)} ${toSymbol}`
    }
  }, [prices])

  // Calculate total market value for given amount
  const getTotalMarketValue = useCallback((
    amount: string,
    fromSymbol: string,
    toSymbol: string
  ): string => {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return "0"

    const marketPrice = getMarketPrice(fromSymbol, toSymbol)
    if (marketPrice <= 0) return "0"

    const totalValue = amountNum * marketPrice
    if (totalValue >= 1) {
      return totalValue.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 6 
      })
    } else {
      return totalValue.toFixed(8)
    }
  }, [getMarketPrice])

  // Manual refetch function
  const refetch = useCallback(() => {
    const manager = managerRef.current
    if (manager) {
      manager.fetchPrices(true) // Force fetch
    }
  }, [])

  return {
    prices,
    loading,
    error,
    lastUpdated,
    getSwapPrices,
    calculateOutputAmount,
    formatPrice,
    formatExchangeRate,
    getMarketPrice,
    getMarketPriceText,
    getMarketPriceEthToAda,
    getMarketPriceAdaToEth,
    getTotalMarketValue,
    refetch
  }
}

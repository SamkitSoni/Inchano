'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useBalance } from 'wagmi'

interface TokenBalances {
  ETH: string
  USDC: string
  ADA: string
}

interface UseBalancesReturn {
  balances: TokenBalances
  loading: boolean
  error: string | null
  refreshBalances: () => void
}

export function useBalances(): UseBalancesReturn {
  const [balances, setBalances] = useState<TokenBalances>({
    ETH: '0.00',
    USDC: '0.00',
    ADA: '0.00'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { address, isConnected } = useAccount()

  // Get ETH balance using wagmi
  const { data: ethBalance, refetch: refetchEth } = useBalance({
    address,
    query: {
      enabled: isConnected && !!address,
    }
  })

  // Get USDC balance (mock for now - in production you'd use the USDC contract)
  const { data: usdcBalance, refetch: refetchUsdc } = useBalance({
    address,
    token: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8', // USDC on Sepolia (example)
    query: {
      enabled: isConnected && !!address,
    }
  })

  const fetchCardanoBalance = useCallback(async () => {
    // Mock Cardano balance - in production, you'd integrate with a Cardano wallet
    // For now, return a mock balance
    return '1,234.56'
  }, [])

  const refreshBalances = useCallback(async () => {
    if (!isConnected) {
      setBalances({
        ETH: '0.00',
        USDC: '0.00',
        ADA: '0.00'
      })
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Refresh Ethereum balances
      await Promise.all([refetchEth(), refetchUsdc()])

      // Fetch Cardano balance
      const adaBalance = await fetchCardanoBalance()

      setBalances({
        ETH: ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : '0.00',
        USDC: usdcBalance ? parseFloat(usdcBalance.formatted).toFixed(2) : '0.00',
        ADA: adaBalance
      })
    } catch (err) {
      console.error('Error fetching balances:', err)
      setError('Failed to fetch balances')
    } finally {
      setLoading(false)
    }
  }, [isConnected, ethBalance, usdcBalance, refetchEth, refetchUsdc, fetchCardanoBalance])

  // Update balances when wallet connects or balances change
  useEffect(() => {
    refreshBalances()
  }, [refreshBalances])

  // Provide mock balances for demonstration
  useEffect(() => {
    if (!isConnected) {
      // Show demo balances when not connected
      setBalances({
        ETH: '2.5480',
        USDC: '1,500.00',
        ADA: '1,234.56'
      })
    }
  }, [isConnected])

  return {
    balances,
    loading,
    error,
    refreshBalances
  }
}

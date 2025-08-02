'use client'

import { useState } from 'react'
import { ArrowUpDown, Wallet, ExternalLink } from 'lucide-react'
import { useOrders } from '@/hooks/useOrders';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useOrderCreation } from '@/lib/orderService';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TokenSelector } from '@/components/token-selector'
import { WalletConnector } from '@/components/wallet-connector'

interface SwapToken {
  symbol: string
  name: string
  icon: string
  balance?: string
  chain: 'ethereum' | 'cardano'
}

const ETHEREUM_TOKENS: SwapToken[] = [
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠', chain: 'ethereum' },
  { symbol: 'USDC', name: 'USD Coin', icon: '💰', chain: 'ethereum' },
]

const CARDANO_TOKENS: SwapToken[] = [
  { symbol: 'ADA', name: 'Cardano', icon: '₳', chain: 'cardano' },
]

export function SwapInterface() {
  const ALL_TOKENS: SwapToken[] = [
    ...CARDANO_TOKENS,
    ...ETHEREUM_TOKENS,
  ];
  const [fromToken, setFromToken] = useState<SwapToken>(ALL_TOKENS[0])
  const [toToken, setToToken] = useState<SwapToken>(ETHEREUM_TOKENS[0])
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [isSwapping, setIsSwapping] = useState(false)

  const { address: walletAddress } = useAccount();
  const { createOrder, loading: apiLoading, error } = useOrders();
  const { createAndSignOrder, isLoading: signingLoading } = useOrderCreation();
  const { isConnected } = useWebSocket({
    onOrderCreated: (orderHash, order) => {
      console.log(`Order created: ${orderHash}`, order);
    },
    onOrderUpdated: (event) => {
      console.log(`Order updated: ${event.orderHash}`, event);
    },
  });

  const loading = apiLoading || signingLoading;

  const handleSwapTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setFromAmount('')
    setToAmount('')
    setDestinationAddress('')
  }

  // Token selection logic
  const getAvailableTokens = (isFrom: boolean) => {
    if (isFrom) {
      // User can select ADA, ETH, USDC
      return ALL_TOKENS;
    }
    // For 'to' token:
    if (fromToken.symbol === 'ADA') {
      // If 'from' is ADA, 'to' can be ETH or USDC
      return ETHEREUM_TOKENS;
    } else if (fromToken.symbol === 'ETH' || fromToken.symbol === 'USDC') {
      // If 'from' is ETH or USDC, 'to' can only be ADA
      return CARDANO_TOKENS;
    }
    return [];
  }

  const isEthereumToCardano = fromToken && toToken && fromToken.chain === 'ethereum' && toToken.chain === 'cardano';
  const isCardanoToEthereum = fromToken && toToken && fromToken.chain === 'cardano' && toToken.chain === 'ethereum';

  return (
    <div className="w-full max-w-md mx-auto">
      <Card className="p-6 bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Swap</h2>
          {/* <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
            <Settings className="h-5 w-5" />
          </Button> */}
        </div>

        <div className="space-y-4">
          {/* From Token */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">From</label>
            </div>
            <div className="relative">
              <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-lg border border-white/10">
                <TokenSelector
                  tokens={getAvailableTokens(true)}
                  selectedToken={fromToken}
                  onSelectToken={(token) => {
                    setFromToken(token);
                    // Reset toToken when fromToken changes
                    if (token.symbol === 'ADA') {
                      setToToken(ETHEREUM_TOKENS[0]);
                    } else {
                      setToToken(CARDANO_TOKENS[0]);
                    }
                  }}
                />
                <input
                  type="text"
                  placeholder="0.0"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  className="flex-1 bg-transparent text-right text-xl text-white placeholder-gray-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleSwapTokens}
              variant="ghost"
              size="icon"
              className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-full"
            >
              <ArrowUpDown className="h-4 w-4 text-white" />
            </Button>
          </div>

          {/* To Token */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">To</label>
              
            </div>
            <div className="relative">
              <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-lg border border-white/10">
                <TokenSelector
                  tokens={getAvailableTokens(false)}
                  selectedToken={toToken}
                  onSelectToken={setToToken}
                  disabled={fromToken.symbol === 'ETH' || fromToken.symbol === 'USDC'}
                />
                <input
                  type="text"
                  placeholder="0.0"
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                  className="flex-1 bg-transparent text-right text-xl text-white placeholder-gray-500 outline-none"
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* Destination Address */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">
              Destination {toToken ? (toToken.chain === 'ethereum' ? 'Ethereum' : 'Cardano') : ''} Address
            </label>
            <input
              type="text"
              placeholder={`Enter ${toToken ? (toToken.chain === 'ethereum' ? 'Ethereum' : 'Cardano') : ''} address...`}
              value={destinationAddress}
              onChange={(e) => setDestinationAddress(e.target.value)}
              className="w-full p-3 bg-white/5 rounded-lg border border-white/10 text-white placeholder-gray-500 outline-none focus:border-blue-400"
            />
          </div>

          {/* Wallet Connection Section */}
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Connect Wallet</span>
            </div>
            
            {isEthereumToCardano && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Connect your Ethereum wallet to swap from ETH/USDC</p>
                <WalletConnector type="ethereum" />
              </div>
            )}
            
            {isCardanoToEthereum && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Connect your Cardano wallet to swap from ADA</p>
                <WalletConnector type="cardano" />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500 text-white p-2 rounded">
              Error: {error}
            </div>
          )}

          <Button 
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200"
            disabled={!fromAmount || !destinationAddress || isSwapping || loading || !isConnected}
            onClick={async () => {
              if (!walletAddress || !destinationAddress || !fromAmount) return;
              
              setIsSwapping(true);
              try {
                // Create and sign the order
                const orderRequest = await createAndSignOrder({
                  fromToken: fromToken.symbol,
                  toToken: toToken.symbol,
                  fromAmount,
                  toAmount: toAmount || fromAmount, // Use calculated or input amount
                  maker: walletAddress,
                  receiver: destinationAddress,
                });
                
                // Submit to relayer
                await createOrder(orderRequest);
                
                // Reset form on success
                setFromAmount('');
                setToAmount('');
                setDestinationAddress('');
                
              } catch (error) {
                console.error('Order creation failed:', error);
              } finally {
                setIsSwapping(false);
              }
            }}
          >
            {isSwapping ? 'Swapping...' : 'Swap Tokens'}
          </Button>

          {/* Transaction Details */}
          <div className="p-4 bg-white/5 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Network Fee</span>
              <span>~$2.50</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Exchange Rate</span>
              <span>1 {fromToken.symbol} ≈ 2,341.5 {toToken ? toToken.symbol : ''}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Estimated Time</span>
              <span>~15-30 minutes</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Network Info */}
      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="flex items-center gap-2 text-blue-300 text-sm">
          <ExternalLink className="h-4 w-4" />
          <span>Using Sepolia (ETH) ↔ Preprod (Cardano) testnets</span>
        </div>
      </div>
    </div>
  )
}

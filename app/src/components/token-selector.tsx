'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SwapToken {
  symbol: string
  name: string
  icon: string
  balance?: string
  chain: 'ethereum' | 'cardano'
}

interface TokenSelectorProps {
  tokens: SwapToken[]
  selectedToken: SwapToken
  onSelectToken: (token: SwapToken) => void
}

export function TokenSelector({ tokens, selectedToken, onSelectToken }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 hover:bg-white/10 rounded-lg"
      >
        <span className="text-2xl">{selectedToken.icon}</span>
        <div className="text-left">
          <div className="font-semibold text-white">{selectedToken.symbol}</div>
          <div className="text-xs text-gray-400 capitalize">{selectedToken.chain}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-gray-900/95 backdrop-blur-xl border border-white/20 rounded-lg shadow-xl z-50">
          <div className="p-2">
            <div className="text-xs text-gray-400 mb-2 px-2">Select Token</div>
            {tokens.map((token) => (
              <button
                key={`${token.symbol}-${token.chain}`}
                onClick={() => {
                  onSelectToken(token)
                  setIsOpen(false)
                }}
                className="w-full flex items-center space-x-3 p-3 hover:bg-white/10 rounded-lg transition-colors"
              >
                <span className="text-xl">{token.icon}</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-white">{token.symbol}</div>
                  <div className="text-sm text-gray-400">{token.name}</div>
                  <div className="text-xs text-gray-500 capitalize">{token.chain}</div>
                </div>
                <div className="text-sm text-gray-400">
                  {token.balance || '0.00'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

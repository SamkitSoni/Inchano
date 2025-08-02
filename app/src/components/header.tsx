'use client'

import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header() {
  return (
    <header className="w-full bg-black/20 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/inchano-logo.png" alt="Inchano Logo" className="w-14 h-14 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-white">Inchano</h1>
              <p className="text-sm text-gray-400">Cross-Chain Swap Platform</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-400">
              <span className="text-green-400">●</span> Sepolia & Preprod
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

'use client'

import { SwapInterface } from '@/components/swap-interface'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <SwapInterface />
      </div>
      <Footer />
    </main>
  )
}

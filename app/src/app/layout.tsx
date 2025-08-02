import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Inchano - Cross-Chain Swap Platform',
  description: 'Seamlessly swap between Ethereum and Cardano networks with 1inch Fusion technology',
  keywords: ['DeFi', 'Cross-chain', 'Swap', 'Ethereum', 'Cardano', '1inch', 'Fusion'],
  authors: [{ name: 'Inchano Team' }],
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen relative">
            {/* Subtle gradient background */}
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800" style={{ filter: 'blur(2px)' }} />
            {/* Soft white overlay for minimalism */}
            <div className="absolute inset-0 z-0 bg-white/5" />
            <div className="relative z-10">
              {children}
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}

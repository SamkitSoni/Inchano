import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { metaMask, walletConnect, coinbaseWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [sepolia],
  connectors: [
    metaMask(),
    walletConnect({ 
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'your-project-id',
    }),
    coinbaseWallet({
      appName: 'Inchano',
      appLogoUrl: 'https://via.placeholder.com/64',
    }),
  ],
  transports: {
    [sepolia.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}

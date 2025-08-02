export function Footer() {
  return (
    <footer className="w-full bg-black/20 backdrop-blur-md border-t border-white/10 mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-6 text-sm text-gray-400">
            <span>© 2024 Inchano</span>
            <span>•</span>
            <span>Powered by 1inch Fusion</span>
          </div>
          
          <div className="flex items-center space-x-6 text-sm">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-xs text-gray-500 text-center">
            <p>
              Cross-chain swaps between Ethereum and Cardano networks. 
              Currently running on testnets for development purposes.
            </p>
            <p className="mt-1">
              ⚠️ This is experimental software. Use at your own risk.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

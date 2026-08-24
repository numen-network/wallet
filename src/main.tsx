import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { ChainProvider } from '@/chain/provider'
import { App } from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

// sr25519 comes from wasm. Waiting once here keeps every key path synchronous
await cryptoWaitReady()

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChainProvider>
        <App />
      </ChainProvider>
    </QueryClientProvider>
  </StrictMode>,
)

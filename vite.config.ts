/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __COMMIT__: JSON.stringify(commit),
  },
  build: {
    // Reproducible output so users can verify the deployed bundle themselves
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The live suite needs a node on the other end, so it runs on its own
    exclude: ['**/node_modules/**', 'src/**/*.live.test.ts'],
  },
})

/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * The suite that talks to a real node. It is kept out of `pnpm test` because it
 * needs one running, and it gets a config of its own rather than a flag because
 * the default include deliberately skips it.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.live.test.ts'],
  },
})

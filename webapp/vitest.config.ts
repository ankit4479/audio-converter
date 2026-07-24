import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deliberately not layered on vite.config.ts via mergeConfig: that config's
// reactRouter() plugin (#25) drives dev/build's own document + prerender
// lifecycle and fails under vitest with "React Router Vite plugin can't
// detect preamble" - it expects the framework's own dev/build entry points,
// which vitest's transform-only usage never runs. Tests only need JSX/TS
// transform and Tailwind, so they get a plain @vitejs/plugin-react instead,
// duplicating the few non-plugin settings vite.config.ts also sets.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})

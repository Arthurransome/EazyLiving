import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // The bundled app is ~950 KB pre-gzip, mostly Recharts + Radix. That's
    // expected for a single-bundle SPA used as a class demo, so quiet the
    // 500 KB advisory chunk-size warning.
    chunkSizeWarningLimit: 1024,
  },
})

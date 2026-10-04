import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // pdf.js (~640 kB) is only loaded by the lazily-imported PDF viewer chunk.
  build: { chunkSizeWarningLimit: 700 },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  // `npm run preview` serves the production build with the same API proxy; extra hosts
  // (e.g. a tunnel domain) can be allowed via VITE_ALLOWED_HOSTS=".example.com,…".
  preview: {
    host: true,
    port: 4173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(',').filter(Boolean),
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to vercel dev (port 3000) so API functions work locally.
    // Run: vercel dev   (not npm run dev) – it starts everything on port 3000.
    // If you must use npm run dev separately, keep this proxy pointing at
    // wherever vercel dev is listening.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

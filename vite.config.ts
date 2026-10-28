import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Pin to 5173 — the origin whitelisted in Auth0. strictPort makes a
    // second instance fail loudly instead of silently moving to 5174.
    port: 5173,
    strictPort: true,
    proxy: {
      // The U-Course Advisor backend. All data comes from its API; this app
      // never talks to the database directly.
      '/api': {
        target: 'https://u-course-advisor-production.up.railway.app',
        changeOrigin: true,
      },
    },
  },
})

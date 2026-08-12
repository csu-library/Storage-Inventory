import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Production is served from https://libutil.library.colostate.edu/storageinv/ ,
// so built asset URLs need that prefix baked in. Dev keeps the app at domain
// root so the /api proxy below is unaffected.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/storageinv/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8765',
    },
  },
}))

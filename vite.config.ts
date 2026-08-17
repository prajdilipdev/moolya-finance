import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    // Left at Vite's default (500kB) deliberately: with vendor-bank now
    // lazy-loaded (see App.tsx) and recharts in its own chunk, every chunk
    // in the initial page load fits under it. Raising this instead of
    // fixing the actual splitting just silences the warning that would
    // have caught the regression.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-charts': ['recharts'],
          // Only reachable from the lazy-loaded Import page (see App.tsx) —
          // this chunk should never appear in the initial page load.
          'vendor-bank': ['pdfjs-dist', 'xlsx'],
        },
      },
    },
  },
})

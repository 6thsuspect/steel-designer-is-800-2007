import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer (React) build. Electron main/preload are compiled with tsc (tsconfig.electron.json).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

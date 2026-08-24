import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: ['chrome69', 'safari12'],
    cssTarget: 'chrome69',
    sourcemap: false
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080', '/health': 'http://localhost:8080' }
  }
});

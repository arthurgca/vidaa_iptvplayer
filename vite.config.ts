import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json';

export default defineConfig({
  plugins: [preact()],
  // Keeps the bundle's idea of the version tied to the same manifest the server reads.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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

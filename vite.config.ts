import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: {
    exclude: []
  },
  server: {
    allowedHosts: process.env.AMP_ORB ? true : undefined,
    port: 5173
  },
  build: {
    chunkSizeWarningLimit: 30000
  }
});

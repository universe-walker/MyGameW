import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// NGROK_HOST is optional now. When provided, we configure secure HMR for Telegram WebApp via ngrok.
const ngrokHost = process.env.NGROK_HOST || '';
const useNgrok = !!ngrokHost;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true, // listen on all interfaces
    // Allow any host by default; if NGROK_HOST is set, restrict to it for safety.
    allowedHosts: useNgrok ? [ngrokHost] : true,
    hmr: useNgrok
      ? {
          protocol: 'wss',
          host: ngrokHost,
          clientPort: 443,
        }
      : undefined,
    proxy: {
      // Proxy API (REST + Socket.IO) through the dev server so the WebApp can use same-origin HTTPS
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});

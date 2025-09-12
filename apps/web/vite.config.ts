import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Update ngrokHost to your current ngrok subdomain if it changes
const ngrokHost = process.env.NGROK_HOST || '131d23c6facb.ngrok-free.app';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true, // listen on all interfaces
    allowedHosts: [ngrokHost],
    hmr: {
      protocol: 'wss',
      host: ngrokHost,
      clientPort: 443,
    },
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

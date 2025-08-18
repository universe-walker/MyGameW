import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Update ngrokHost to your current ngrok subdomain if it changes
const ngrokHost = 'acff64ab3135.ngrok-free.app';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on all interfaces
    allowedHosts: [ngrokHost],
    hmr: {
      protocol: 'wss',
      host: ngrokHost,
      clientPort: 443,
    },
  },
});



import { io, Socket } from 'socket.io-client';
import type { TSocketClientToServerEvents, TSocketServerToClientEvents } from '@mygame/shared';

let socket: Socket<TSocketServerToClientEvents, TSocketClientToServerEvents> | null = null;

export function connectSocket(initDataRaw: string, userJson?: string) {
  const url =
    import.meta.env.VITE_API_BASE_URL || (window as any).API_BASE_URL || 'http://localhost:4000';
  
  // Always create a fresh socket to avoid stale event listeners
  if (socket) {
    socket.disconnect();
  }
  
  socket = io(`${url}/game`, {
    transports: ['websocket'],
    auth: { initDataRaw, user: userJson },
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}



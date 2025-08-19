import { io, Socket } from 'socket.io-client';
import type { TSocketClientToServerEvents, TSocketServerToClientEvents } from '@mygame/shared';

let socket: Socket<TSocketServerToClientEvents, TSocketClientToServerEvents> | null = null;

export function connectSocket(initDataRaw: string, userJson?: string) {
  const base =
    import.meta.env.VITE_API_BASE_URL || (window as any).API_BASE_URL || 'http://localhost:4000';
  const pathPrefix = (import.meta as any).env?.VITE_API_PATH_PREFIX || (window as any).API_PATH_PREFIX || '';
  const nsUrl = `${base}${pathPrefix}/game`;

  if (socket) {
    console.log('[socket] connectSocket: disconnect existing socket id=', (socket as any).id, 'connected=', (socket as any).connected);
    socket.disconnect();
  }

  console.log('[socket] connectSocket: creating new socket', {
    url: nsUrl,
    authHasUser: Boolean(userJson),
    initDataRawLen: initDataRaw?.length ?? 0,
  });

  socket = io(nsUrl, {
    transports: ['websocket'],
    auth: { initDataRaw, user: userJson },
  });

  // Lifecycle logging
  (socket as any).on('connect', () => {
    console.log('[socket] connect: id=', (socket as any).id);
  });
  (socket as any).on('connect_error', (err: any) => {
    console.error('[socket] connect_error:', err?.message ?? err);
  });
  (socket as any).on('error', (err: any) => {
    console.error('[socket] error:', err);
  });
  (socket as any).on('disconnect', (reason: any) => {
    console.warn('[socket] disconnect:', reason);
  });
  (socket as any).io?.on?.('reconnect_attempt', (n: number) => {
    console.log('[socket] reconnect_attempt:', n);
  });
  (socket as any).io?.on?.('reconnect', (n: number) => {
    console.log('[socket] reconnect success after attempts:', n);
  });
  (socket as any).io?.on?.('reconnect_error', (err: any) => {
    console.error('[socket] reconnect_error:', err?.message ?? err);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    console.log('[socket] disconnectSocket: id=', (socket as any).id, 'connected=', (socket as any).connected);
    socket.disconnect();
    socket = null;
  }
}



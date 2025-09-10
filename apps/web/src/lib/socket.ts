import { io } from 'socket.io-client';
import type { Socket } from '@mygame/shared';
import { apiBase } from './api';

let socket: Socket | null = null;

export function connectSocket(initDataRaw: string) {
  const nsUrl = `${apiBase}/game`;

  if (socket) {
    console.log(
      '[socket] connectSocket: disconnect existing socket id=',
      socket.id,
      'connected=',
      socket.connected,
    );
    socket.disconnect();
  }

  console.log('[socket] connectSocket: creating new socket', {
    url: nsUrl,
    initDataRawLen: initDataRaw?.length ?? 0,
  });

  socket = io(nsUrl, {
    transports: ['websocket'],
    auth: { initDataRaw },
  }) as unknown as Socket;

  // Lifecycle logging
  socket.on('connect', () => {
    console.log('[socket] connect: id=', socket.id);
  });
  socket.on('connect_error', (err: any) => {
    console.error('[socket] connect_error:', err?.message ?? err);
  });
  socket.on('error', (err: any) => {
    console.error('[socket] error:', err);
  });
  socket.on('disconnect', (reason: any) => {
    console.warn('[socket] disconnect:', reason);
  });
  socket.io.on('reconnect_attempt', (n: number) => {
    console.log('[socket] reconnect_attempt:', n);
  });
  socket.io.on('reconnect', (n: number) => {
    console.log('[socket] reconnect success after attempts:', n);
  });
  socket.io.on('reconnect_error', (err: any) => {
    console.error('[socket] reconnect_error:', err?.message ?? err);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    console.log('[socket] disconnectSocket: id=', socket.id, 'connected=', socket.connected);
    socket.disconnect();
    socket = null;
  }
}



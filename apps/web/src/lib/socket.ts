import { io } from 'socket.io-client';
import type { Socket } from '@mygame/shared';
import { apiHostBase, apiPathPrefix } from './api';
import { getAuthDate, TELEGRAM_INIT_DATA_TTL_SECONDS, getInitDataDiagnostics } from './telegram';

let socket: Socket | null = null;

export function connectSocket(initDataRaw: string) {
  const nsUrl = `${apiHostBase}/game`;
  const authDate = getAuthDate();
  const authDateIso = authDate !== null ? new Date(authDate * 1000).toISOString() : null;
  let authAgeSeconds: number | null = null;
  let authExpired: boolean | null = null;

  if (authDate !== null) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    authAgeSeconds = Math.max(0, nowSeconds - authDate);
    authExpired = authAgeSeconds > TELEGRAM_INIT_DATA_TTL_SECONDS;
    console.log('[socket] initData auth_date check', {
      authDate,
      authDateIso,
      ageSeconds: authAgeSeconds,
      ttlSeconds: TELEGRAM_INIT_DATA_TTL_SECONDS,
      expired: authExpired,
    });
    if (authExpired) {
      console.warn('[socket] initData auth_date appears expired');
    }
  } else {
    console.warn('[socket] initData auth_date missing');
  }
  try {
    const diag = getInitDataDiagnostics();
    console.log('[socket] initData fields check', diag);
  } catch {}
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
    authDate,
    authDateIso,
    authDateAgeSeconds: authAgeSeconds ?? undefined,
    authDateExpired: authExpired ?? undefined,
  });
  socket = io(nsUrl, {
    // Ensure the Socket.IO handshake goes through the Vite proxy prefix
    path: `${apiPathPrefix || ''}/socket.io` || '/socket.io',
    // Allow fallback to polling when websockets are blocked by proxies
    transports: ['websocket', 'polling'],
    auth: { initDataRaw },
  }) as unknown as Socket;

  // Lifecycle logging
  const s = socket as Socket;
  s.on('connect', () => {
    console.log('[socket] connect: id=', s.id);
  });
  s.on('connect_error', (err: any) => {
    console.error('[socket] connect_error:', err?.message ?? err);
  });
  s.on('error', (err: any) => {
    console.error('[socket] error:', err);
  });
  s.on('disconnect', (reason: any) => {
    console.warn('[socket] disconnect:', reason);
  });
  s.io.on('reconnect_attempt', (n: number) => {
    console.log('[socket] reconnect_attempt:', n);
  });
  s.io.on('reconnect', (n: number) => {
    console.log('[socket] reconnect success after attempts:', n);
  });
  s.io.on('reconnect_error', (err: any) => {
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

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getStartParam, getUser } from '../lib/telegram';
import { connectSocket, getSocket, disconnectSocket } from '../lib/socket';
import { useGameStore } from '../state/store';
import { useUiHome } from '../state/ui';
import { Match } from './Match';
import DebugConsole from './DebugConsole';

export function App() {
  const [verified, setVerified] = useState(false);
  const setRoom = useGameStore((s) => s.setRoom);
  const setPhase = useGameStore((s) => s.setPhase);
  const setBoard = useGameStore((s) => s.setBoard);
  const setBotStatus = useGameStore((s) => s.setBotStatus);
  const roomId = useGameStore((s) => s.roomId);
  const solo = useGameStore((s) => s.solo);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const until = useGameStore((s) => s.until);
  const botStatuses = useGameStore((s) => s.botStatuses);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const { shopOpen, achievementsOpen, openShop, closeShop, openAchievements, closeAchievements } = useUiHome();
  const [profileScore, setProfileScore] = useState<number>(0);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);

  const apiBase = useMemo(
    () => import.meta.env.VITE_API_BASE_URL || (window as any).API_BASE_URL || 'http://localhost:4000',
    [],
  );

  const showDebugConsole = useMemo(() => {
    const mode = (import.meta as any).env?.MODE as string | undefined;
    const flag = (import.meta as any).env?.VITE_DEBUG_CONSOLE as string | undefined;
    // Defaults: dev -> ON, prod -> OFF. Can override via VITE_DEBUG_CONSOLE.
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return mode !== 'production';
  }, []);

  // Helper: fetch with fallback to '/api' prefix if the first request returns 404 or errors
  const fetchApi = async (path: string, init?: RequestInit) => {
    const primary = `${apiBase}${path}`;
    try {
      const r = await fetch(primary, init);
      if (r.status !== 404) return r;
      console.warn('[api] 404 on', primary, '-> trying /api prefix');
    } catch (e) {
      console.warn('[api] error on', primary, e, '-> trying /api prefix');
    }
    const secondary = `${apiBase}/api${path}`;
    try {
      const r2 = await fetch(secondary, init);
      return r2;
    } catch (e2) {
      console.error('[api] error on', secondary, e2);
      throw e2;
    }
  };

  const verify = useMutation({
    mutationFn: async (initDataRaw: string) => {
      const res = await fetchApi(`/auth/telegram/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initDataRaw }),
      });
      if (!res.ok) throw new Error('verify failed');
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => setVerified(true),
  });

  useEffect(() => {
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    verify.mutate(initDataRaw);
    // API health check
    (async () => {
      try {
        console.log('[health] apiBase =', apiBase);
        const r = await fetch(`${apiBase}/healthz`);
        const t = await r.text().catch(() => '');
        console.log('[health] GET /healthz ->', r.status, t);
      } catch (e) {
        console.error('[health] GET /healthz failed', e);
      }
    })();
    
    const urlStartParam = new URLSearchParams(location.search).get('start_param');
    const start = getStartParam() ?? urlStartParam;
    if (start && start.startsWith('room_')) {
      const id = start.slice('room_'.length);
      // Do not auto-join: store pending id and let user decide
      setPendingRoomId(id);
    }
    // Try loading profile score when possible
    if (user) {
      fetchApi(`/profile?userId=${user.id}`).then(async (r) => {
        if (r.ok) {
          const j = (await r.json()) as { profileScore: number };
          if (typeof j.profileScore === 'number') setProfileScore(j.profileScore);
        }
      });
    }
  }, []);

  const setupSocketListeners = (socket: any) => {
    console.log('[socket] setupSocketListeners: attaching listeners');
    (socket as any).off?.('room:state');
    (socket as any).off?.('game:phase');
    (socket as any).off?.('bot:status');
    (socket as any).off?.('board:state');
    (socket as any).on('room:state', (state: any) => {
      console.log('[socket] event room:state', state);
      setRoom(state.roomId, state.players, Boolean(state.solo));
    });
    (socket as any).on('game:phase', (p: any) => {
      console.log('[socket] event game:phase', p);
      setPhase(p.phase, p.until, p.activePlayerId ?? null, p.question);
    });
    (socket as any).on('bot:status', (b: any) => {
      console.log('[socket] event bot:status', b);
      setBotStatus(b.playerId, b.status);
    });
    (socket as any).on('board:state', (b: any) => {
      console.log('[socket] event board:state', b);
      if (Array.isArray(b?.categories)) setBoard(b.categories);
    });
  };

  const onFindGame = async () => {
    console.log('[ui] onFindGame: click');
    setGameStarted(true);
    try {
      let socket = getSocket();
      console.log('[ui] onFindGame: existing socket?', Boolean(socket));
      if (!socket) {
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        console.log('[ui] onFindGame: connecting socket, hasUser=', Boolean(user), 'initDataRaw.length=', initDataRaw.length);
        socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        setupSocketListeners(socket);
      }
      console.log('[ui] onFindGame: POST /rooms');
      const res = await fetchApi(`/rooms`, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[ui] onFindGame: rooms create failed', res.status, txt);
        return;
      }
      const j = (await res.json()) as { roomId: string };
      console.log('[ui] onFindGame: /rooms ok -> join', j);
      (socket as any).emit('rooms:join', { roomId: j.roomId });
      console.log('[ui] onFindGame: emitted rooms:join', j.roomId);
    } catch (e) {
      console.error('[ui] onFindGame: error', e);
    }
  };

  const onJoinPendingRoom = () => {
    if (!pendingRoomId) return;
    console.log('[ui] onJoinPendingRoom: join', pendingRoomId);
    setGameStarted(true);
    try {
      let socket = getSocket();
      console.log('[ui] onJoinPendingRoom: existing socket?', Boolean(socket));
      if (!socket) {
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        console.log('[ui] onJoinPendingRoom: connecting socket, hasUser=', Boolean(user), 'initDataRaw.length=', initDataRaw.length);
        socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        setupSocketListeners(socket);
      }
      (socket as any).emit('rooms:join', { roomId: pendingRoomId });
      console.log('[ui] onJoinPendingRoom: emitted rooms:join', pendingRoomId);
      // Optionally clear hint once action taken
      setPendingRoomId(null);
    } catch (e) {
      console.error('[ui] onJoinPendingRoom: error', e);
    }
  };

  const onSoloGame = async () => {
    // Create a solo room and auto-join
    console.log('[ui] onSoloGame: click');
    setGameStarted(true);
    try {
      let socket = getSocket();
      console.log('[ui] onSoloGame: existing socket?', Boolean(socket));
      if (!socket) {
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        console.log('[ui] onSoloGame: connecting socket, hasUser=', Boolean(user), 'initDataRaw.length=', initDataRaw.length);
        socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        setupSocketListeners(socket);
      }
      console.log('[ui] onSoloGame: POST /rooms/solo');
      const res = await fetchApi(`/rooms/solo`, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[ui] onSoloGame: rooms/solo failed', res.status, txt);
        return;
      }
      const j = (await res.json()) as { roomId: string };
      console.log('[ui] onSoloGame: /rooms/solo ok -> join', j);
      (socket as any).emit('rooms:join', { roomId: j.roomId });
      console.log('[ui] onSoloGame: emitted rooms:join', j.roomId);
    } catch (e) {
      console.error('[ui] onSoloGame: error', e);
    }
  };

  const onBuzzer = () => {
    const socket = getSocket();
    if (roomId && socket) (socket as any).emit('buzzer:press', { roomId });
  };

  const onAnswer = (text: string) => {
    const socket = getSocket();
    if (roomId && socket && text.trim()) {
      (socket as any).emit('answer:submit', { roomId, text: text.trim() });
    }
  };

  const onPause = () => {
    if (!roomId) return;
    const socket = getSocket();
    if (socket) (socket as any).emit('solo:pause', { roomId });
  };
  const onResume = () => {
    if (!roomId) return;
    const socket = getSocket();
    if (socket) (socket as any).emit('solo:resume', { roomId });
  };

  const onLeave = () => {
    const socket = getSocket();
    if (socket && roomId) (socket as any).emit('rooms:leave', { roomId });
    disconnectSocket();
    leaveRoom();
    setGameStarted(false);
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until]);

  const remainingMs = until ? Math.max(0, until - now) : undefined;

  return (
    <div className="min-h-full flex flex-col p-4">
      {/* AppBar (hidden for solo game page) */}
      {!(roomId && solo) && (
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold">MyGame</div>
          <div className="flex items-center gap-3">
            <button className="text-sm px-2 py-1 rounded bg-gray-100" onClick={openAchievements}>
              🏆 Достижения
            </button>
            <div className="text-sm px-2 py-1 rounded bg-yellow-100">
              ⭐ Счёт: {profileScore}
            </div>
            <button className="text-sm px-2 py-1 rounded bg-gray-100" onClick={openShop}>
              🛒 Магазин
            </button>
          </div>
        </div>
      )}

      {roomId ? (
        <div className="grow">
          <Match onBuzzer={onBuzzer} onAnswer={onAnswer} onPause={onPause} onResume={onResume} onLeave={onLeave} />
        </div>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-4">
          {pendingRoomId && (
            <div className="w-full max-w-md p-3 rounded bg-yellow-50 border border-yellow-200 text-sm">
              Найдена приглашение в комнату: <span className="font-mono">{pendingRoomId}</span>
              <div className="mt-2 flex gap-2">
                <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={onJoinPendingRoom}>Присоединиться</button>
                <button className="px-3 py-2 rounded bg-gray-200" onClick={() => setPendingRoomId(null)}>Игнорировать</button>
              </div>
            </div>
          )}
          <button className="w-full max-w-md py-4 text-lg rounded bg-blue-600 text-white" onClick={onFindGame}>
            Найти игру
          </button>
          <button className="w-full max-w-md py-4 text-lg rounded bg-indigo-600 text-white" onClick={onSoloGame}>
            Одиночная игра
          </button>
          {!verified && <div className="text-sm text-gray-500">Верификация...</div>}
        </div>
      )}

      {/* Modals (simple placeholders) */}
      {shopOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={closeShop}>
          <div className="bg-white rounded p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Подсказки</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>Открыть 1 букву</div>
                <button className="px-3 py-1 rounded bg-blue-600 text-white">Купить</button>
              </div>
              <div className="flex items-center justify-between">
                <div>Пакет 2 буквы</div>
                <button className="px-3 py-1 rounded bg-blue-600 text-white">Купить</button>
              </div>
            </div>
            <button className="mt-4 w-full py-2 rounded bg-gray-200" onClick={closeShop}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {achievementsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={closeAchievements}>
          <div className="bg-white rounded p-4 w-96" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Достижения</div>
            <div className="text-sm text-gray-500">Скоро здесь будет список бейджей и прогресс.</div>
            <button className="mt-4 w-full py-2 rounded bg-gray-200" onClick={closeAchievements}>
              Закрыть
            </button>
          </div>
        </div>
      )}
      {showDebugConsole && <DebugConsole />}
    </div>
  );
}



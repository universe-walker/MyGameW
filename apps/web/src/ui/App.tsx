import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getStartParam, getUser } from '../lib/telegram';
import { fetchApi, apiBase } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../state/store';
import { useUiHome } from '../state/ui';
import { Match } from './Match';
import DebugConsole from './DebugConsole';
import ShopModal from './ShopModal';
import AchievementsModal from './AchievementsModal';

export function App() {
  const [verified, setVerified] = useState(false);
  const roomId = useGameStore((s) => s.roomId);
  const solo = useGameStore((s) => s.solo);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const setPaused = useGameStore((s) => s.setPaused);
  const { shopOpen, achievementsOpen, openShop, closeShop, openAchievements, closeAchievements } = useUiHome();
  const [profileScore, setProfileScore] = useState<number>(0);
  const [hintAllowance, setHintAllowance] = useState<number>(0);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [, setGameStarted] = useState(false);

  const showDebugConsole = (() => {
    const mode = (import.meta as any).env?.MODE as string | undefined;
    const flag = (import.meta as any).env?.VITE_DEBUG_CONSOLE as string | undefined;
    // Defaults: dev -> ON, prod -> OFF. Can override via VITE_DEBUG_CONSOLE.
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return mode !== 'production';
  })();

  const { connect, disconnect, getSocket } = useSocket();

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
    // Load profile (score and hint balance)
    if (user) {
      fetchApi(`/profile`).then(async (r) => {
        if (r.ok) {
          const j = (await r.json()) as { profileScore: number; hintAllowance?: number };
          if (typeof j.profileScore === 'number') setProfileScore(j.profileScore);
          if (typeof j.hintAllowance === 'number') setHintAllowance(j.hintAllowance);
        }
      });
    }
  }, []);

  const onFindGame = async () => {
    console.log('[ui] onFindGame: click');
    setGameStarted(true);
    try {
      const socket = connect();
      console.log('[ui] onFindGame: POST /rooms');
      const res = await fetchApi(`/rooms`, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[ui] onFindGame: rooms create failed', res.status, txt);
        return;
      }
      const j = (await res.json()) as { roomId: string };
      console.log('[ui] onFindGame: /rooms ok -> join', j);
      socket?.emit('rooms:join', { roomId: j.roomId });
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
      const socket = connect();
      socket?.emit('rooms:join', { roomId: pendingRoomId });
      console.log('[ui] onJoinPendingRoom: emitted rooms:join', pendingRoomId);
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
      const socket = connect();
      console.log('[ui] onSoloGame: POST /rooms/solo');
      const res = await fetchApi(`/rooms/solo`, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[ui] onSoloGame: rooms/solo failed', res.status, txt);
        return;
      }
      const j = (await res.json()) as { roomId: string };
      console.log('[ui] onSoloGame: /rooms/solo ok -> join', j);
      socket?.emit('rooms:join', { roomId: j.roomId });
      console.log('[ui] onSoloGame: emitted rooms:join', j.roomId);
    } catch (e) {
      console.error('[ui] onSoloGame: error', e);
    }
  };

  const onAnswer = (text: string) => {
    const socket = getSocket();
    if (roomId && socket && text.trim()) {
      socket.emit('answer:submit', { roomId, text: text.trim() });
    }
  };

  const onPause = () => {
    if (!roomId) return;
    const socket = getSocket();
    socket?.emit('solo:pause', { roomId });
    setPaused(true);
  };
  const onResume = () => {
    if (!roomId) return;
    const socket = getSocket();
    socket?.emit('solo:resume', { roomId });
    setPaused(false);
  };

  const onLeave = () => {
    const socket = getSocket();
    if (socket && roomId) socket.emit('rooms:leave', { roomId });
    disconnect();
    leaveRoom();
    setGameStarted(false);
  };

  return (
    <div className="min-h-full flex flex-col p-4">
      {/* AppBar (hidden for solo game page) */}
      {!(roomId && solo) && (
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold">MyGame</div>
          <div className="flex items-center gap-3">
            <button className="text-sm px-2 py-1 rounded bg-gray-100" onClick={openAchievements}>
              Достижения
            </button>
            <div className="text-sm px-2 py-1 rounded bg-yellow-100">Проф. очки: {profileScore}</div>
            <div className="text-sm px-2 py-1 rounded bg-yellow-50">⭐ Подсказки: {hintAllowance}</div>
            <button className="text-sm px-2 py-1 rounded bg-gray-100" onClick={openShop}>
              Магазин
            </button>
          </div>
        </div>
      )}

      {roomId ? (
        <div className="grow">
          <Match onAnswer={onAnswer} onPause={onPause} onResume={onResume} onLeave={onLeave} />
        </div>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-4">
          {pendingRoomId && (
            <div className="w-full max-w-md p-3 rounded bg-yellow-50 border border-yellow-200 text-sm">
              Приглашение в игру с ID: <span className="font-mono">{pendingRoomId}</span>
              <div className="mt-2 flex gap-2">
                <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={onJoinPendingRoom}>Присоединиться</button>
                <button className="px-3 py-2 rounded bg-gray-200" onClick={() => setPendingRoomId(null)}>Скрыть</button>
              </div>
            </div>
          )}
          <button className="w-full max-w-md py-4 text-lg rounded bg-blue-600 text-white" onClick={onFindGame}>
            Найти игру
          </button>
          <button className="w-full max-w-md py-4 text-lg rounded bg-indigo-600 text-white" onClick={onSoloGame}>
            Соло режим
          </button>
          {!verified && <div className="text-sm text-gray-500">Инициализация...</div>}
        </div>
      )}

      {/* Modals */}
      <ShopModal
        open={shopOpen}
        onClose={closeShop}
        onPurchaseCompleted={async () => {
          const prev = hintAllowance;
          const attempts = 6;
          for (let i = 0; i < attempts; i++) {
            const r = await fetchApi(`/profile`);
            if (r.ok) {
              const j = (await r.json()) as { profileScore: number; hintAllowance?: number };
              if (typeof j.profileScore === 'number') setProfileScore(j.profileScore);
              if (typeof j.hintAllowance === 'number') {
                setHintAllowance(j.hintAllowance);
                if (j.hintAllowance > prev) break; // balance updated
              }
            }
            if (i < attempts - 1) await new Promise((res) => setTimeout(res, 500));
          }
        }}
      />
      <AchievementsModal open={achievementsOpen} onClose={closeAchievements} />
      {showDebugConsole && <DebugConsole />}
    </div>
  );
}


import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getStartParam, getUser } from '../lib/telegram';
import { connectSocket } from '../lib/socket';
import { useGameStore } from '../state/store';
import { useUiHome } from '../state/ui';

export function App() {
  const [verified, setVerified] = useState(false);
  const setRoom = useGameStore((s) => s.setRoom);
  const setPhase = useGameStore((s) => s.setPhase);
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

  const verify = useMutation({
    mutationFn: async (initDataRaw: string) => {
      const res = await fetch(`${apiBase}/auth/telegram/verify`, {
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
    
    const urlStartParam = new URLSearchParams(location.search).get('start_param');
    const start = getStartParam() ?? urlStartParam;
    if (start && start.startsWith('room_')) {
      const id = start.slice('room_'.length);
      // Do not auto-join: store pending id and let user decide
      setPendingRoomId(id);
    }
    // Try loading profile score when possible
    if (user) {
      fetch(`${apiBase}/profile?userId=${user.id}`).then(async (r) => {
        if (r.ok) {
          const j = (await r.json()) as { profileScore: number };
          if (typeof j.profileScore === 'number') setProfileScore(j.profileScore);
        }
      });
    }
  }, []);

  const setupSocketListeners = (socket: any) => {
    (socket as any).on('room:state', (state: any) => setRoom(state.roomId, state.players, Boolean(state.solo)));
    (socket as any).on('game:phase', (p: any) => setPhase(p.phase, p.until));
    (socket as any).on('bot:status', (b: any) => setBotStatus(b.playerId, b.status));
  };

  const onFindGame = async () => {
    setGameStarted(true);
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    
    setupSocketListeners(socket);
    
    // Auto create or join a public room
    const res = await fetch(`${apiBase}/rooms`, { method: 'POST' });
    const j = (await res.json()) as { roomId: string };
    socket.emit('rooms:join', { roomId: j.roomId });
  };

  const onJoinPendingRoom = () => {
    if (!pendingRoomId) return;
    setGameStarted(true);
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    
    setupSocketListeners(socket);
    
    socket.emit('rooms:join', { roomId: pendingRoomId });
    // Optionally clear hint once action taken
    setPendingRoomId(null);
  };

  const onSoloGame = async () => {
    // Create a solo room and auto-join
    setGameStarted(true);
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    
    setupSocketListeners(socket);
    
    const res = await fetch(`${apiBase}/rooms/solo`, { method: 'POST' });
    const j = (await res.json()) as { roomId: string };
    socket.emit('rooms:join', { roomId: j.roomId });
  };

  const onBuzzer = () => {
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    if (roomId) (socket as any).emit('buzzer:press', { roomId });
  };

  const onPause = () => {
    if (!roomId) return;
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    (socket as any).emit('solo:pause', { roomId });
  };
  const onResume = () => {
    if (!roomId) return;
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    (socket as any).emit('solo:resume', { roomId });
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
      {/* AppBar */}
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

      {!gameStarted ? (
        // Main actions
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
      ) : (
        // Match screen (basic)
        <div className="grow flex flex-col gap-4">
          <div className="p-3 rounded bg-gray-100 flex items-center justify-between">
            <div>
              <div className="font-semibold">Фаза: {phase}</div>
              {remainingMs !== undefined && <div className="text-sm text-gray-600">До окончания: {(remainingMs / 1000).toFixed(1)}с</div>}
            </div>
            {solo && (
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded bg-gray-200" onClick={onPause}>Пауза</button>
                <button className="px-3 py-1 rounded bg-gray-200" onClick={onResume}>Продолжить</button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200"
                onClick={() => {
                  const initDataRaw = getInitDataRaw() ?? '';
                  const user = getUser();
                  const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
                  if (roomId) (socket as any).emit('rooms:leave', { roomId });
                  leaveRoom();
                  setGameStarted(false);
                }}
              >
                Выйти в меню
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {players.map((p) => (
              <div key={p.id} className="p-3 rounded border flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name} {p.bot ? '🤖' : '🧑'}</div>
                  <div className="text-sm text-gray-600">{botStatuses[p.id] ?? 'idle'}</div>
                </div>
                {!p.bot && (
                  <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={onBuzzer} disabled={phase !== 'buzzer_window'}>
                    ЖМИ!
                  </button>
                )}
              </div>
            ))}
          </div>
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
    </div>
  );
}



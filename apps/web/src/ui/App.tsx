import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getStartParam, getUser } from '../lib/telegram';
import { connectSocket } from '../lib/socket';
import { useGameStore } from '../state/store';
import { useUiHome } from '../state/ui';

export function App() {
  const [verified, setVerified] = useState(false);
  const setRoom = useGameStore((s) => s.setRoom);
  const roomId = useGameStore((s) => s.roomId);
  const { shopOpen, achievementsOpen, openShop, closeShop, openAchievements, closeAchievements } = useUiHome();
  const [profileScore, setProfileScore] = useState<number>(0);

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
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    socket.on('room:state', (state) => setRoom(state.roomId, state.players));
    const urlStartParam = new URLSearchParams(location.search).get('start_param');
    const start = getStartParam() ?? urlStartParam;
    if (start && start.startsWith('room_')) {
      const id = start.slice('room_'.length);
      socket.emit('rooms:join', { roomId: id });
    } else {
      // Do not auto-join; wait for user action on Home screen
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

  const onFindGame = async () => {
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    // Auto create or join a public room
    const res = await fetch(`${apiBase}/rooms`, { method: 'POST' });
    const j = (await res.json()) as { roomId: string };
    socket.emit('rooms:join', { roomId: j.roomId });
  };

  const onSoloGame = async () => {
    // Placeholder: create a private room (server can later add bots if solo=true)
    const initDataRaw = getInitDataRaw() ?? '';
    const user = getUser();
    const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
    const res = await fetch(`${apiBase}/rooms`, { method: 'POST' });
    const j = (await res.json()) as { roomId: string };
    socket.emit('rooms:join', { roomId: j.roomId });
  };

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

      {/* Main actions */}
      <div className="grow flex flex-col items-center justify-center gap-4">
        <button className="w-full max-w-md py-4 text-lg rounded bg-blue-600 text-white" onClick={onFindGame}>
          Найти игру
        </button>
        <button className="w-full max-w-md py-4 text-lg rounded bg-indigo-600 text-white" onClick={onSoloGame}>
          Одиночная игра
        </button>
        {!verified && <div className="text-sm text-gray-500">Верификация...</div>}
      </div>

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



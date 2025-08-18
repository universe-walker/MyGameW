import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getStartParam, getUser } from '../lib/telegram';
import { connectSocket, getSocket } from '../lib/socket';
import { useGameStore } from '../state/store';

export function App() {
  const [verified, setVerified] = useState(false);
  const setRoom = useGameStore((s) => s.setRoom);
  const roomId = useGameStore((s) => s.roomId);
  const players = useGameStore((s) => s.players);

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
      fetch(`${apiBase}/rooms`, { method: 'POST' })
        .then((r) => r.json())
        .then((j: { roomId: string }) => socket.emit('rooms:join', { roomId: j.roomId }));
    }
  }, []);

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold">{roomId ? `Комната ${roomId}` : 'Загрузка...'}</h1>
        <div className="space-y-2">
          <div className="font-medium">Игроки</div>
          <ul className="list-disc pl-6">
            {players.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </div>
        <button
          className="w-full py-2 rounded bg-gray-300 text-gray-600 cursor-not-allowed"
          disabled
        >
          Сигнал
        </button>
        {!verified && <div className="text-sm text-red-500">Верификация...</div>}
      </div>
    </div>
  );
}



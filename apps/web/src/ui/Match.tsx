import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../state/store';

type Props = {
  onBuzzer: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onLeave: () => void;
};

export function Match({ onBuzzer, onPause, onResume, onLeave }: Props) {
  const roomId = useGameStore((s) => s.roomId);
  const solo = useGameStore((s) => s.solo);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const until = useGameStore((s) => s.until);
  const botStatuses = useGameStore((s) => s.botStatuses);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until]);
  const remainingMs = until ? Math.max(0, until - now) : undefined;

  const grid = useMemo(() => {
    // Placeholder 4x4 board
    const cats = ['КОРТИЗОЛ', 'ВИРУСЫ', 'ТЕРМИНЫ', 'ХИРУРГИЯ'];
    const costs = [100, 200, 300, 400];
    return { cats, costs };
  }, []);

  return (
    <div className="flex flex-col gap-3 min-h-screen">

      {/* Phase + timer */}
      <div className="flex items-center justify-between p-2 rounded bg-slate-100">
        <div className="text-sm">Фаза: {phase}</div>
        {remainingMs !== undefined && (
          <div className="font-mono">{Math.ceil(remainingMs / 100) / 10}s</div>
        )}
      </div>

      {/* Board placeholder */}
      <div className="grid grid-cols-4 gap-3">
        {grid.cats.map((c) => (
          <div key={c} className="rounded bg-indigo-900 text-white text-center py-2 font-semibold">
            {c}
          </div>
        ))}
        {grid.costs.map((cost) =>
          grid.cats.map((c) => (
            <button
              key={`${c}-${cost}`}
              className="rounded bg-indigo-600 text-white py-4 text-lg hover:bg-indigo-700"
              disabled
              title="Скоро"
            >
              {cost}
            </button>
          )),
        )}
      </div>

      {/* Controls (wire in App.tsx) */}
      <div className="flex gap-3">
        <button onClick={onBuzzer} className="px-4 py-2 rounded bg-blue-600 text-white">
          Сигнал
        </button>
        {solo && (
          <>
            <button onClick={onPause} className="px-3 py-2 rounded bg-gray-200">Пауза</button>
            <button onClick={onResume} className="px-3 py-2 rounded bg-gray-200">Продолжить</button>
          </>
        )}
        <button onClick={onLeave} className="ml-auto px-3 py-2 rounded bg-red-100 text-red-700">
          Выйти
        </button>
      </div>

      {/* Scoreboard moved to bottom */}
      <div className="grid grid-cols-3 gap-3 mt-auto">
        {players.map((p, i) => (
          <div key={p.id} className="rounded bg-slate-800 text-white p-3 flex flex-col items-center">
            <div className="text-sm opacity-80">{p.bot ? `Бот ${i + 1}` : 'Вы'}</div>
            <div className="text-lg font-semibold">{p.name}</div>
            <div className="mt-2 text-2xl">0</div>
            {p.bot && (
              <div className="mt-1 text-xs text-yellow-300">{botStatuses[p.id] ?? '...'}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

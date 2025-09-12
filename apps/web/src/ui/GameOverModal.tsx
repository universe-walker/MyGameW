import type { Player } from '../state/store';

export type GameOverModalProps = {
  open: boolean;
  players: Player[];
  scores?: Record<string, number>;
  onOk: () => void;
};

export default function GameOverModal({ open, players, scores, onOk }: GameOverModalProps) {
  if (!open) return null;
  const entries = players.map((p) => ({
    id: p.id,
    name: p.name,
    bot: !!p.bot,
    score: scores?.[String(p.id)] ?? 0,
  }));
  entries.sort((a, b) => b.score - a.score);
  const top = entries.slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-[min(92vw,540px)] rounded-xl bg-white shadow-2xl border border-slate-200 p-4 sm:p-6">
        <div className="text-center text-2xl sm:text-3xl font-extrabold text-slate-800">Игра окончена</div>
        <div className="mt-1 text-center text-sm text-slate-500">Результаты</div>

        <div className="mt-4 flex flex-col gap-2">
          {top.map((e, idx) => (
            <div
              key={e.id}
              className={`flex items-center gap-3 rounded px-3 py-2 border ${
                idx === 0 ? 'bg-yellow-50 border-yellow-200' : idx === 1 ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div
                className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold ${
                  idx === 0 ? 'bg-yellow-300 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-900' : 'bg-amber-300 text-amber-900'
                }`}
                title={`${idx + 1} место`}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{e.name}{e.bot ? ' (бот)' : ''}</div>
              </div>
              <div className="font-mono text-lg">{e.score}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-center">
          <button onClick={onOk} className="px-5 py-2 rounded bg-indigo-600 text-white text-base">Ок</button>
        </div>
      </div>
    </div>
  );
}

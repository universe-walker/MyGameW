import type { Player } from '../state/store';

export type ScoreboardProps = {
  players: Player[];
  botStatuses: Record<number, string>;
  isMyTurnToAnswer: boolean;
  scores?: Record<string, number>;
};

export function Scoreboard({ players, botStatuses, isMyTurnToAnswer, scores }: ScoreboardProps) {
  return (
    <div className="grid grid-cols-3 gap-3 mt-auto">
      {players.map((p, i) => (
        <div key={p.id} className="rounded bg-slate-800 text-white p-3 flex flex-col items-center">
          <div className="text-sm opacity-80">{p.bot ? `Бот ${i + 1}` : 'Вы'}</div>
          <div className="text-lg font-semibold">{p.name}</div>
          <div className="mt-2 text-2xl">{scores?.[String(p.id)] ?? 0}</div>
          {p.bot ? (
            <div className="mt-1 text-xs text-yellow-300">{botStatuses[p.id] ?? '...'}</div>
          ) : (
            <div className={`mt-1 text-xs ${isMyTurnToAnswer ? 'text-green-300' : 'text-gray-400'}`}>
              {isMyTurnToAnswer ? 'Ваш ход' : 'Ожидание'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


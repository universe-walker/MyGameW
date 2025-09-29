import { useEffect, useRef, useState } from 'react';
import type { Player } from '../state/store';

export type ScoreboardProps = {
  players: Player[];
  botStatuses: Record<number, string>;
  isMyTurnToAnswer: boolean;
  scores?: Record<string, number>;
};

export function Scoreboard({ players, botStatuses, isMyTurnToAnswer, scores }: ScoreboardProps) {
  // Track previous scores to compute deltas
  const prevScoresRef = useRef<Record<string, number>>({});
  const [bursts, setBursts] = useState<Array<{ id: number; playerId: number; delta: number }>>([]);
  const seqRef = useRef(1);

  useEffect(() => {
    if (!scores) return;
    const nextPrev = { ...prevScoresRef.current };
    players.forEach((p) => {
      const k = String(p.id);
      const prev = nextPrev[k];
      const cur = scores[k] ?? 0;
      if (prev !== undefined) {
        const delta = cur - prev;
        if (delta !== 0) {
          const id = seqRef.current++;
          setBursts((arr) => [...arr, { id, playerId: p.id, delta }]);
          // Cleanup after animation ends
          setTimeout(() => {
            setBursts((arr) => arr.filter((b) => b.id !== id));
          }, 2200);
        }
      }
      nextPrev[k] = cur;
    });
    prevScoresRef.current = nextPrev;
  }, [scores, players]);

  return (
    <div className="grid grid-cols-3 gap-3">
    {players.map((p, i) => {
      const score = scores?.[String(p.id)] ?? 0;
      const myBursts = bursts.filter((b) => b.playerId === p.id);

      return (
        <div
          key={p.id}
          className={`
            relative overflow-visible
            rounded-2xl
            bg-gradient-to-br from-indigo-800 to-indigo-900
            text-white p-3
            flex flex-col items-center
            shadow-[0_12px_24px_-8px_rgba(99,102,241,0.5)]
            border-2 border-indigo-700
            transition-all duration-300 ease-in-out
            hover:translate-y-[-2px] hover:shadow-[0_16px_28px_-8px_rgba(99,102,241,0.6)]
            ${!p.bot && isMyTurnToAnswer ? 'ring-2 ring-emerald-400/70' : ''}
          `}
        >
          {/* Floating score deltas */}
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 z-10 flex flex-col items-center gap-1">
            {myBursts.map((b) => (
              <span
                key={b.id}
                className={`
                  score-burst text-lg font-extrabold
                  ${b.delta > 0 ? 'text-emerald-300' : 'text-rose-300'}
                  drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]
                `}
              >
                {b.delta > 0 ? `+${b.delta}` : `${b.delta}`}
              </span>
            ))}
          </div>

          {/* Роль/тип игрока — маленькая капсула */}
          <div
            className="
              text-[11px] uppercase tracking-wide
              px-2 py-0.5 rounded-full
              bg-indigo-700/40 border border-indigo-400/30
              font-['Dosis',sans-serif]
            "
          >
            {p.bot ? `Бот ${i + 1}` : 'Игрок'}
          </div>

          {/* Имя */}
          <div className="mt-1 text-lg font-semibold font-['Dosis',sans-serif] text-white/95 text-center">
            {p.name}
          </div>

          {/* Счёт — капсула в индиго-градиенте */}
          <div
            className="
              mt-2 text-2xl font-extrabold font-['Dosis',sans-serif]
              px-3 py-1 rounded-full
              bg-gradient-to-br from-indigo-500 to-indigo-600
              shadow-[0_8px_20px_-4px_rgba(99,102,241,0.5)]
              border border-indigo-400/40
            "
            title="Текущий счёт"
          >
            {score}
          </div>

          {/* Индикатор хода — только для людей */}
          {p.bot ? null : (
            <div className="mt-1 text-xs">
              {isMyTurnToAnswer ? (
                <span
                  className="
                    inline-flex items-center gap-1
                    px-2 py-0.5 rounded-full
                    bg-gradient-to-br from-emerald-400 to-emerald-600
                    text-white font-medium
                    shadow-[0_12px_22px_-6px_rgba(16,185,129,0.45)]
                  "
                >
                  ● Ваш ход
                </span>
              ) : (
                <span className="text-white/50"> </span>
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
  );
}

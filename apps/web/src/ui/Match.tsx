import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../state/store';
import { getSocket } from '../lib/socket';

type Props = {
  onBuzzer: () => void;
  onAnswer: (text: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onLeave: () => void;
};

export function Match({ onBuzzer, onAnswer, onPause, onResume, onLeave }: Props) {
  const roomId = useGameStore((s) => s.roomId);
  const solo = useGameStore((s) => s.solo);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const until = useGameStore((s) => s.until);
  const activePlayerId = useGameStore((s) => s.activePlayerId ?? null);
  const botStatuses = useGameStore((s) => s.botStatuses);
  const board = useGameStore((s) => s.boardCategories);
  const question = useGameStore((s) => s.question);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until]);
  const remainingMs = until ? Math.max(0, until - now) : undefined;

  const grid = useMemo(() => {
    const cats = board.map((c) => c.title);
    // Collect unique values across categories, then sort asc
    const valuesSet = new Set<number>();
    board.forEach((c) => c.values.forEach((v) => valuesSet.add(v)));
    // Limit total rows to max 5 across the board
    const MAX_ROWS = 5;
    const costs = Array.from(valuesSet)
      .sort((a, b) => a - b)
      .slice(0, MAX_ROWS);
    return { cats, costs };
  }, [board]);

  // Measure category title heights and align all to the tallest (with an upper cap)
  const headerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const MAX_HEADER_H = 112; // px cap for too long titles (about 3–4 lines)

  // Per-header dynamic font-size to make words fit without breaking
  const [headerFontSizes, setHeaderFontSizes] = useState<number[]>([]);
  useEffect(() => {
    const fitAll = () => {
      const isWide = window.innerWidth >= 1024;
      const isMd = window.innerWidth >= 640;
      const MAX_FS = isWide ? 20 : isMd ? 18 : 16; // upper bound responsive to screen
      const MIN_FS = 11;
      const next: number[] = new Array(grid.cats.length).fill(MIN_FS);
      headerRefs.current.forEach((el, i) => {
        if (!el) return;
        // Ensure natural wrapping (no mid-word breaks)
        el.style.wordBreak = 'normal';
        el.style.overflowWrap = 'normal';
        // Binary search suitable font-size
        let lo = MIN_FS;
        let hi = MAX_FS;
        let best = MIN_FS;
        for (let k = 0; k < 12; k++) {
          const mid = Math.floor((lo + hi) / 2);
          el.style.fontSize = `${mid}px`;
          // Force reflow by reading
          const wOk = el.scrollWidth <= el.clientWidth + 1;
          const hOk = el.scrollHeight <= MAX_HEADER_H;
          if (wOk && hOk) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        next[i] = best;
      });
      setHeaderFontSizes(next);
    };
    const id = requestAnimationFrame(fitAll);
    window.addEventListener('resize', fitAll);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', fitAll);
    };
  }, [grid.cats]);

  useEffect(() => {
    const measure = () => {
      const heights = headerRefs.current.map((el) => el?.offsetHeight ?? 0);
      const max = heights.length ? Math.max(...heights) : 0;
      setHeaderHeight(Math.min(max, MAX_HEADER_H));
    };
    const id = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
    };
  }, [grid.cats, headerFontSizes]);

  // My player id (first non-bot)
  const myId = useMemo(() => players.find((p) => !p.bot)?.id ?? 0, [players]);
  const isMyTurnToAnswer = phase === 'answer_wait' && activePlayerId === myId;
  const canBuzz = phase === 'buzzer_window' && activePlayerId == null;
  const canPick = phase === 'prepare' && !question;

  const onPickCell = (category: string, value: number) => {
    if (!roomId || !canPick) return;
    const socket = getSocket();
    (socket as any)?.emit('board:pick', { roomId, category, value });
  };

  const [answer, setAnswer] = useState('');
  const submitAnswer = () => {
    if (!isMyTurnToAnswer || !answer.trim()) return;
    onAnswer(answer.trim());
    setAnswer('');
  };

  return (
    <div className="flex flex-col gap-3 min-h-screen overflow-x-hidden">

      {/* Phase + timer */}
      <div className="flex items-center justify-between p-2 rounded bg-slate-100">
        <div className="text-sm">Фаза: {phase}</div>
        {remainingMs !== undefined && (
          <div className="font-mono">{Math.ceil(remainingMs / 100) / 10}s</div>
        )}
      </div>

      {/* Board: titles above columns (not inside first row) */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${grid.cats.length}, minmax(0, 1fr))` }}
      >
        {grid.cats.map((c, i) => (
          <div key={c} className="flex flex-col gap-3">
            <div
              ref={(el) => (headerRefs.current[i] = el)}
              className="rounded bg-indigo-900 text-white text-center font-semibold flex items-center justify-center px-2 py-2 overflow-hidden whitespace-normal break-normal leading-tight"
              style={{ height: headerHeight || undefined, fontSize: headerFontSizes[i] ? `${headerFontSizes[i]}px` : undefined }}
            >
              {c}
            </div>
            {grid.costs.map((cost) => (
              <button
                key={`${c}-${cost}`}
                className={`rounded py-4 text-lg ${canPick ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                disabled={!canPick || !board.find((bc) => bc.title === c)?.values.includes(cost)}
                onClick={() => onPickCell(c, cost)}
                title={canPick ? 'Выбрать вопрос' : 'Ожидание следующего хода'}
              >
                {cost}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Question prompt */}
      {question && (
        <div className="p-3 rounded bg-yellow-50 border border-yellow-200">
          <div className="text-xs text-yellow-700">{question.category} · {question.value}</div>
          <div className="mt-1 text-lg">{question.prompt}</div>
        </div>
      )}

      {/* Controls (wire in App.tsx) */}
      <div className="flex items-center gap-2 flex-nowrap">
        <button
          onClick={onBuzzer}
          disabled={!canBuzz}
          className={`px-3 py-2 rounded text-sm md:text-base whitespace-nowrap ${canBuzz ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
          title={canBuzz ? 'Жмите, чтобы взять право ответа' : 'Дождитесь окна сигнала'}
        >
          Сигнал
        </button>
        {isMyTurnToAnswer && (
          <div className="flex items-center gap-2">
            <input
              className="px-2 py-1 border rounded text-sm md:text-base"
              placeholder="Ваш ответ..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAnswer();
              }}
              autoFocus
            />
            <button onClick={submitAnswer} className="px-3 py-2 rounded bg-green-600 text-white text-sm md:text-base">
              Ответить
            </button>
            <div className="text-xs text-green-700">Ваш ход!</div>
          </div>
        )}
        {solo && (
          <>
            <button onClick={onPause} className="px-3 py-2 rounded bg-gray-200 text-sm md:text-base whitespace-nowrap">Пауза</button>
            <button onClick={onResume} className="px-3 py-2 rounded bg-gray-200 text-sm md:text-base whitespace-nowrap">Продолжить</button>
          </>
        )}
        <button onClick={onLeave} className="ml-auto px-3 py-2 rounded bg-red-100 text-red-700 text-sm md:text-base whitespace-nowrap">
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
    </div>
  );
}

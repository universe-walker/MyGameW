import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../state/store';
import { Board } from './Board';
import { QuestionPrompt } from './QuestionPrompt';
import { Controls } from './Controls';
import { Scoreboard } from './Scoreboard';
import { getUser } from '../lib/telegram';

type Props = {
  onAnswer: (text: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onLeave: () => void;
};

export function Match({ onAnswer, onPause, onResume, onLeave }: Props) {
  const roomId = useGameStore((s) => s.roomId);
  const solo = useGameStore((s) => s.solo);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const until = useGameStore((s) => s.until);
  const activePlayerId = useGameStore((s) => s.activePlayerId ?? null);
  const botStatuses = useGameStore((s) => s.botStatuses);
  const board = useGameStore((s) => s.boardCategories);
  const question = useGameStore((s) => s.question);
  const scores = useGameStore((s) => s.scores);
  const paused = useGameStore((s) => s.paused);
  const pauseOffsetMs = useGameStore((s) => s.pauseOffsetMs);
  const pauseStartedAt = useGameStore((s) => s.pauseStartedAt);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until]);

  const dynamicOffset = pauseStartedAt && paused ? pauseOffsetMs + (now - pauseStartedAt) : pauseOffsetMs;
  const remainingMs = until ? Math.max(0, until + dynamicOffset - now) : undefined;

  // My player id: use Telegram user id if available, fallback to first non-bot
  const myId = useMemo(() => {
    const uid = getUser()?.id;
    if (uid != null) return uid;
    return players.find((p) => !p.bot)?.id ?? 0;
  }, [players]);
  const isMyTurnToAnswer = phase === 'answer_wait' && activePlayerId === myId;
  const hasOptions = Array.isArray(question?.options) && (question?.options?.length ?? 0) > 0;
  const canPick = phase === 'prepare' && activePlayerId === myId;
  const showBoard = phase === 'prepare';

  return (
    <div className="flex flex-col gap-3 min-h-screen overflow-x-hidden">
      {/* Phase + timer */}
      <div className="flex items-center justify-between p-2 rounded bg-slate-100">
        <div className="flex items-center gap-2">
          <div className="text-sm">Фаза: {phase}</div>
          {paused && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">⏸ Пауза</span>
          )}
        </div>
        {remainingMs !== undefined && (
          <div className="font-mono">{Math.ceil(remainingMs / 100) / 10}s</div>
        )}
      </div>

      {/* Board: горизонтальный скролл при узких экранах, без растягивания по высоте */}
      {showBoard && (
        <div className="w-full overflow-x-auto">
          <Board roomId={roomId} board={board} canPick={canPick} />
        </div>
      )}

      <QuestionPrompt question={question} />

      {/* Super-game MCQ options */}
      {isMyTurnToAnswer && hasOptions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {question!.options!.map((opt) => (
            <button
              key={opt}
              onClick={() => onAnswer(opt)}
              className="px-3 py-2 rounded bg-indigo-600 text-white text-sm md:text-base text-left"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <Controls
        onAnswer={onAnswer}
        onPause={onPause}
        onResume={onResume}
        onLeave={onLeave}
        isMyTurnToAnswer={isMyTurnToAnswer && !hasOptions}
        solo={solo}
        paused={paused}
      />

      <Scoreboard
        players={players}
        botStatuses={botStatuses}
        isMyTurnToAnswer={isMyTurnToAnswer}
        scores={scores}
      />
    </div>
  );
}


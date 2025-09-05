import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../state/store';
import { Board } from './Board';
import { QuestionPrompt } from './QuestionPrompt';
import { Controls } from './Controls';
import { Scoreboard } from './Scoreboard';

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

  // My player id (first non-bot)
  const myId = useMemo(() => players.find((p) => !p.bot)?.id ?? 0, [players]);
  const isMyTurnToAnswer = phase === 'answer_wait' && activePlayerId === myId;
  const canBuzz = phase === 'buzzer_window' && activePlayerId == null;
  const canPick = phase === 'prepare' && !question;

  return (
    <div className="flex flex-col gap-3 min-h-screen overflow-x-hidden">

      {/* Phase + timer */}
      <div className="flex items-center justify-between p-2 rounded bg-slate-100">
        <div className="text-sm">Фаза: {phase}</div>
        {remainingMs !== undefined && (
          <div className="font-mono">{Math.ceil(remainingMs / 100) / 10}s</div>
        )}
      </div>

      {canPick && <Board roomId={roomId} board={board} canPick={canPick} />}

      <QuestionPrompt question={question} />

      <Controls
        onBuzzer={onBuzzer}
        onAnswer={onAnswer}
        onPause={onPause}
        onResume={onResume}
        onLeave={onLeave}
        canBuzz={canBuzz}
        isMyTurnToAnswer={isMyTurnToAnswer}
        solo={solo}
      />

      <Scoreboard
        players={players}
        botStatuses={botStatuses}
        isMyTurnToAnswer={isMyTurnToAnswer}
      />
    </div>
  );
}

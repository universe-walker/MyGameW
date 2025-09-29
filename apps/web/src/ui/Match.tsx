import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../state/store';
import { Board } from './Board';
import { QuestionPrompt } from './QuestionPrompt';
import { Controls } from './Controls';
import { Scoreboard } from './Scoreboard';
import { getUser } from '../lib/telegram';
import { getSocket } from '../lib/socket';
import GameOverModal from './GameOverModal';

type Props = {
  onAnswer: (text: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onLeave: () => void;
};

export function Match({ onAnswer, onPause, onResume, onLeave }: Props) {
  const roomId = useGameStore((s) => s.roomId);
  const mode = useGameStore((s) => s.mode);
  const players = useGameStore((s) => s.players);
  const lobby = useGameStore((s) => s.lobby);
  const lobbyMinHumans = useGameStore((s) => s.lobbyMinHumans);
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

  // Local overlay pause bookkeeping (used when we cannot truly pause the server, e.g. multiplayer)
  const [overlayActive, setOverlayActive] = useState(false);
  const [overlayStage, setOverlayStage] = useState<'in' | 'out'>('in');
  const overlayStartedAtRef = useRef<number | null>(null);
  const overlayAccMsRef = useRef(0);
  const soloPausedByOverlayRef = useRef(false);
  // Solo game over modal after 2 rounds
  const [gameOverOpen, setGameOverOpen] = useState(false);

  // Effective dynamic offset: includes store pause and local overlay pause (for non-solo)
  const baseOffset = pauseStartedAt && paused ? pauseOffsetMs + (now - pauseStartedAt) : pauseOffsetMs;
  const overlayExtraOffset = mode === 'solo' && soloPausedByOverlayRef.current
    ? 0 // in solo, real pause already reflected by store pause bookkeeping
    : overlayAccMsRef.current + (overlayActive && overlayStartedAtRef.current ? now - overlayStartedAtRef.current : 0);
  const dynamicOffset = baseOffset + overlayExtraOffset;
  const remainingMs = until ? Math.max(0, until + dynamicOffset - now) : undefined;

  // Reset local overlay offsets only when a fresh phase/until arrives and overlay is NOT showing
  const lastPhaseRef = useRef<string | null>(null);
  const lastUntilRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const phaseChanged = lastPhaseRef.current !== phase;
    const untilChanged = lastUntilRef.current !== until;
    if (!overlayActive && (phaseChanged || untilChanged)) {
      overlayAccMsRef.current = 0;
      overlayStartedAtRef.current = null;
    }
    lastPhaseRef.current = phase;
    lastUntilRef.current = until;
  }, [phase, until, overlayActive]);

  // My player id: use Telegram user id if available, fallback to first non-bot
  const myId = useMemo(() => {
    const uid = getUser()?.id;
    if (uid != null) return uid;
    return players.find((p) => !p.bot)?.id ?? 0;
  }, [players]);
  const isMyTurnToAnswer = phase === 'answer_wait' && activePlayerId === myId;
  const hasOptions = Array.isArray(question?.options) && (question?.options?.length ?? 0) > 0;
  const canPick = phase === 'prepare' && activePlayerId === myId;
  const showBoard = phase === 'prepare' && !lobby;

  // Keep layout stable between phases: remember board height and reuse it
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const questionAreaRef = useRef<HTMLDivElement | null>(null);
  const [boardHeight, setBoardHeight] = useState<number>(0);
  useEffect(() => {
    if (!showBoard) return; // measure only when board is visible
    const el = boardWrapRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.round(el.offsetHeight || 0);
      if (h > 0 && Math.abs(h - boardHeight) > 2) setBoardHeight(h);
    };
    // First measure after paint
    const id = requestAnimationFrame(measure);
    // Observe size changes while board is visible
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [showBoard, boardHeight]);

  // When it's my turn to answer, bring the question area into view
  useEffect(() => {
    if (isMyTurnToAnswer) {
      const el = questionAreaRef.current;
      if (el && typeof el.scrollIntoView === 'function') {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          // no-op if smooth scrolling unsupported
          el.scrollIntoView(true as any);
        }
      }
    }
  }, [isMyTurnToAnswer]);

  // Names for header
  const activePlayerName = useMemo(
    () => players.find((p) => p.id === activePlayerId)?.name ?? '',
    [players, activePlayerId],
  );
  const statusText = useMemo(() => {
    if (phase === 'prepare') return activePlayerName ? `Выбирает ${activePlayerName}` : '';
    if (phase === 'answer_wait') return activePlayerName ? `Отвечает ${activePlayerName}` : '';
    return '';
  }, [phase, activePlayerName]);

  // Round overlay detection: show on first prepare and when the board resets (available cell count grows)
  const [roundNumber, setRoundNumber] = useState<number>(0);
  const lastBoardSigRef = useRef<string | null>(null);
  const lastCellCountRef = useRef<number>(0);
  const currentBoardSig = useMemo(() => {
    const parts: string[] = [];
    (board || [])
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((c) => {
        const vs = [...(c.values || [])].sort((a, b) => a - b).join(',');
        parts.push(`${c.title}:${vs}`);
      });
    return parts.join('|');
  }, [board]);
  const currentCellCount = useMemo(() => {
    return (board || []).reduce((acc, c) => acc + (c.values?.length || 0), 0);
  }, [board]);

  const startOverlay = useCallback((num: number) => {
    // Prevent re-entry
    if (overlayActive) return;
    setRoundNumber(num);
    setOverlayStage('in');
    setOverlayActive(true);
    overlayStartedAtRef.current = Date.now();
    // Pause the world: in solo ask the server to pause too
    if (mode === 'solo' && onPause && !paused) {
      try {
        onPause();
        soloPausedByOverlayRef.current = true;
      } catch {}
    }
    // Animate in -> hold -> out -> done
    const holdMs = 1200;
    const fadeOutMs = 300;
    setTimeout(() => {
      setOverlayStage('out');
      setTimeout(() => {
        // First, finalize extra offset so that when we show timer again it's already adjusted
        const startedAt = overlayStartedAtRef.current ?? Date.now();
        overlayAccMsRef.current += Math.max(0, Date.now() - startedAt);
        overlayStartedAtRef.current = null;
        // Now hide overlay
        setOverlayActive(false);
        // Resume solo if we paused it
        if (mode === 'solo' && soloPausedByOverlayRef.current && onResume) {
          try {
            onResume();
          } catch {}
        }
        soloPausedByOverlayRef.current = false;
      }, fadeOutMs);
    }, holdMs);
  }, [overlayActive, mode, onPause, onResume, paused]);

  // Trigger overlay when entering prepare for the first time, or when board cell count increases (new round)
  useEffect(() => {
    if (phase !== 'prepare') return;
    // First prepare ever
    if (!lastBoardSigRef.current) {
      lastBoardSigRef.current = currentBoardSig;
      lastCellCountRef.current = currentCellCount;
      const next = 1;
      setRoundNumber(next);
      startOverlay(next);
      return;
    }
    // New round if cell count grew compared to previous snapshot
    if (currentCellCount > lastCellCountRef.current) {
      lastBoardSigRef.current = currentBoardSig;
      lastCellCountRef.current = currentCellCount;
      const next = (roundNumber || 1) + 1;
      // If solo and about to start round 3 -> show Game Over instead
      if (mode === 'solo' && next >= 3) {
        setGameOverOpen(true);
        setOverlayActive(false);
        setRoundNumber(2);
      } else {
        setRoundNumber(next);
        startOverlay(next);
      }
      return;
    }
    // Same or reduced cells: just update snapshot
    lastBoardSigRef.current = currentBoardSig;
    lastCellCountRef.current = currentCellCount;
  }, [phase, currentBoardSig, currentCellCount, startOverlay, roundNumber]);

  // If server signals the end of the game (final), show Game Over (solo only)
  useEffect(() => {
    if (mode === 'solo' && phase === 'final') {
      setOverlayActive(false);
      setGameOverOpen(true);
    }
  }, [mode, phase]);

  return (
    <div className="flex flex-col gap-3 min-h-screen overflow-x-hidden">
      {lobby && (
        <div className="p-3 rounded bg-blue-50 border border-blue-200">
          <div className="font-semibold mb-1">Ожидание игроков…</div>
          <div className="text-sm text-gray-700">Нужно людей: {lobbyMinHumans ?? 3}</div>
          <div className="mt-2 text-sm">
            Присоединились: {players.filter((p) => !p.bot).length}
            {players.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {players.map((p) => (
                  <span key={p.id} className="px-2 py-0.5 rounded bg-white border text-xs">
                    {p.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Header: active players + timer */}
      <div className="flex items-center justify-between p-2 rounded bg-slate-100">
        <div className="flex items-center gap-2">
          {statusText && <div className="text-sm">{statusText}</div>}
          {paused && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">⏸ Пауза</span>
          )}
        </div>
        {!overlayActive && remainingMs !== undefined && statusText && (
          <div className="font-mono">{Math.ceil(remainingMs / 1000)}с</div>
        )}
      </div>

      {/* Board */}
      {showBoard && (
        <div ref={boardWrapRef} className="w-full overflow-x-auto">
          <Board roomId={roomId} board={board} canPick={canPick} round={Math.max(1, roundNumber || 1)} />
        </div>
      )}

      {/* Question area keeps at least the last measured board height
          to avoid vertical jumps when switching phases. */}
      <div
        ref={questionAreaRef}
        style={{ minHeight: !showBoard ? (boardHeight || 300) : undefined, transition: 'min-height 150ms ease' }}
      >
        <QuestionPrompt question={question} />

        {/* Options under the question (not inside the yellow card) */}
        {isMyTurnToAnswer && hasOptions && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
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

        {/* Inline answer input under the question (no meta buttons) */}
        <div className="mt-2">
          {mode === 'multi' && phase === 'buzzer_window' && (
            <button
              className="px-3 py-2 rounded bg-rose-600 text-white text-sm md:text-base"
              onClick={() => {
                const s = getSocket();
                if (s && roomId) s.emit('buzzer:press', { roomId });
              }}
            >
              ЖМУ!
            </button>
          )}
          <Controls
            onAnswer={onAnswer}
            onPause={onPause}
            onResume={onResume}
            onLeave={onLeave}
            isMyTurnToAnswer={isMyTurnToAnswer && !hasOptions}
            mode={mode}
            paused={paused}
            showMeta={false}
          />
        </div>
      </div>

      {/* Meta controls (pause/resume/leave) below */}
      <Controls
        onAnswer={onAnswer}
        onPause={onPause}
        onResume={onResume}
        onLeave={onLeave}
        isMyTurnToAnswer={false}
        mode={mode}
        paused={paused}
      />

      <Scoreboard
        players={players}
        botStatuses={botStatuses}
        isMyTurnToAnswer={isMyTurnToAnswer}
        scores={scores}
      />

      {/* Round overlay */}
      {overlayActive && !gameOverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative px-6 py-4 rounded-lg bg-indigo-700/90 text-white shadow-2xl border border-white/20"
            style={{
              opacity: overlayStage === 'in' ? 1 : 0,
              transform: overlayStage === 'in' ? 'scale(1)' : 'scale(0.98)',
              transition: 'opacity 300ms ease, transform 300ms ease',
            }}
          >
            <div className="text-3xl sm:text-5xl font-extrabold tracking-wide text-center select-none">
              Раунд {Math.max(1, roundNumber || 1)}
            </div>
          </div>
        </div>
      )}

      {/* Game Over for Solo after Round 2 */}
      {mode === 'solo' && gameOverOpen && (
        <GameOverModal
          open={true}
          players={players}
          scores={scores}
          onOk={() => {
            setGameOverOpen(false);
            onLeave();
          }}
        />
      )}
    </div>
  );
}

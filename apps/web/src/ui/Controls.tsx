import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../state/store';
import { getSocket } from '../lib/socket';
import { useUiHome } from '../state/ui';

export type ControlsProps = {
  onAnswer: (text: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onLeave: () => void;
  isMyTurnToAnswer: boolean;
  mode?: 'solo' | 'multi' | null;
  paused?: boolean;
  showMeta?: boolean;
};

export function Controls({ onAnswer, onPause, onResume, onLeave, isMyTurnToAnswer, mode, paused = false, showMeta = true }: ControlsProps) {
  const mask = useGameStore((s) => s.answerMask);
  const nearMissAt = useGameStore((s) => s.nearMissAt);
  const roomId = useGameStore((s) => s.roomId);
  const canRevealHint = useGameStore((s) => s.canRevealHint);
  const hintErrorMsg = useGameStore((s) => s.hintErrorMsg);
  const [typed, setTyped] = useState<string>('');
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const [hintMode, setHintMode] = useState(false);
  const openShop = useUiHome((s) => s.openShop);

  const slots = useMemo(() => {
    if (!mask) return 64; // fallback when mask not yet received
    let c = 0;
    for (const ch of mask) if (ch === '*') c++;
    return c || 64;
  }, [mask]);

  useEffect(() => {
    if (isMyTurnToAnswer) {
      setTimeout(() => hiddenInputRef.current?.focus(), 0);
    } else {
      setTyped('');
      setHintMode(false);
    }
  }, [isMyTurnToAnswer]);

  // When new mask arrives (new question or next player), clear typed and focus
  useEffect(() => {
    if (mask && isMyTurnToAnswer) {
      setTyped('');
      setTimeout(() => hiddenInputRef.current?.focus(), 0);
      setHintMode(false);
    }
  }, [mask, isMyTurnToAnswer]);

  useEffect(() => {
    if (nearMissAt) {
      setTyped('');
      setTimeout(() => hiddenInputRef.current?.focus(), 0);
    }
  }, [nearMissAt]);

  const onHiddenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const lettersOnly = Array.from(raw)
      .filter((c) => /[\p{L}\p{N}]/u.test(c))
      .join('');
    const limited = lettersOnly.slice(0, slots);
    setTyped(limited);
  };

  const submitAnswer = () => {
    if (!isMyTurnToAnswer) return;
    let out = '';
    if (mask) {
      const letters = Array.from(typed);
      let idx = 0;
      out = Array.from(mask)
        .map((ch) => {
          if (ch === '*') {
            const v = letters[idx] ?? '';
            idx++;
            return v;
          }
          return ch;
        })
        .join('');
    } else {
      // Fallback: submit what was typed when mask is not available
      out = typed;
    }
    out = out.trim();
    if (!out) return;
    // If game is paused (solo), resume first, then answer
    if (paused && onResume) {
      try { onResume(); } catch {}
    }
    onAnswer(out);
  };

  const onHintClick = () => {
    if (!isMyTurnToAnswer) return;
    if (!canRevealHint) return; // UI will show shop button elsewhere
    // If paused, resume first before enabling hint mode
    if (paused && onResume) {
      try { onResume(); } catch {}
    }
    setHintMode((v) => !v);
  };

  const revealAt = (pos: number) => {
    if (!roomId) return;
    const socket = getSocket();
    // Ensure pause is cleared before applying a hint
    if (paused && onResume) {
      try { onResume(); } catch {}
    }
    socket?.emit('hint:reveal_letter', { roomId, position: pos });
    setHintMode(false);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
      {isMyTurnToAnswer && (
        <div className="flex items-start md:items-center gap-2 w-full">
          <div className="flex-1">
            {/* Hidden input (screen reader only). Click below to focus it. */}
            <input
              ref={hiddenInputRef}
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              className="sr-only"
              value={typed}
              onChange={onHiddenChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAnswer();
              }}
            />
            <div
              data-testid="mask-display"
              className="px-3 py-2 border rounded bg-white whitespace-pre-wrap break-words font-mono text-base min-h-[44px] cursor-text"
              onClick={() => hiddenInputRef.current?.focus()}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAnswer();
              }}
            >
                {(() => {
                  if (mask) {
                    const chars = Array.from(mask);
                    const letters = Array.from(typed);
                    let i = 0;
                    return (
                      <span>
                        {chars.map((ch, idx) => {
                          if (ch === '*') {
                            const v = letters[i++] ?? '*';
                            return (
                              <span
                                key={idx}
                                className={
                                  v === '*'
                                    ? hintMode
                                      ? 'text-gray-400 underline decoration-dotted cursor-pointer'
                                      : 'text-gray-400'
                                    : 'text-gray-900'
                                }
                                onClick={() => {
                                  if (hintMode && v === '*') revealAt(idx);
                                }}
                                role={hintMode && v === '*' ? 'button' : undefined}
                              >
                                {v}
                              </span>
                            );
                          }
                          return (
                            <span key={idx} className="text-gray-500">
                              {ch}
                            </span>
                          );
                        })}
                      </span>
                    );
                  }
                  // Fallback view when mask hasn't arrived: fill typed letters, pad with stars
                  const letters = Array.from(typed);
                  const displayLen = Math.max(letters.length || 0, 8);
                  return (
                    <span>
                      {Array.from({ length: displayLen }).map((_, idx) => {
                        const v = letters[idx] ?? '*';
                        return (
                          <span key={idx} className={v === '*' ? 'text-gray-400' : 'text-gray-900'}>
                            {v}
                          </span>
                        );
                      })}
                    </span>
                  );
                })()}
            </div>
            {nearMissAt && typed.length === 0 && (
              <div className="mt-1 text-sm text-amber-700">В слове ошибка, попробуйте ещё раз</div>
            )}
            {hintErrorMsg && (
              <div className="mt-1 text-sm text-red-600">{hintErrorMsg}</div>
            )}
          </div>
          <div className="flex flex-col gap-2 self-start">
          <button
            onClick={submitAnswer}
            className="px-3 py-2 rounded bg-green-600 text-white text-sm md:text-base"
          >
            Ответить
          </button>
          {canRevealHint ? (
            <button
              onClick={onHintClick}
              className={`px-3 py-2 rounded text-sm md:text-base ${hintMode ? 'bg-yellow-600 text-white' : 'bg-yellow-200 text-yellow-900'}`}
            >
              Подсказка
            </button>
          ) : (
            <button
              onClick={() => openShop()}
              className="px-3 py-2 rounded bg-yellow-50 text-yellow-800 text-sm md:text-base"
            >
              Купить подсказки
            </button>
          )}
          </div>
        </div>
      )}
      {showMeta && mode === 'solo' && !paused && (
        <button
          onClick={onPause}
          className="px-3 py-2 rounded bg-gray-200 text-sm md:text-base whitespace-nowrap"
        >
          Пауза
        </button>
      )}
      {showMeta && mode === 'solo' && paused && (
        <button
          onClick={onResume}
          className="px-3 py-2 rounded bg-gray-200 text-sm md:text-base whitespace-nowrap"
        >
          Продолжить
        </button>
      )}
      {showMeta && (
      <button
        onClick={onLeave}
        className="ml-auto px-3 py-2 rounded bg-red-100 text-red-700 text-sm md:text-base whitespace-nowrap"
      >
        Выйти
      </button>
      )}
    </div>
  );
}

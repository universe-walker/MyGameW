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
  const answerLen = useGameStore((s) => s.answerLen);
  const nearMissAt = useGameStore((s) => s.nearMissAt);
  const roomId = useGameStore((s) => s.roomId);
  const canRevealHint = useGameStore((s) => s.canRevealHint);
  const hintErrorMsg = useGameStore((s) => s.hintErrorMsg);
  const [typed, setTyped] = useState<string>('');
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const [hintMode, setHintMode] = useState(false);
  const openShop = useUiHome((s) => s.openShop);

  const slots = useMemo(() => {
    if (mask) {
      let c = 0;
      for (const ch of mask) if (ch === '*') c++;
      return c;
    }
    if (answerLen > 0) return answerLen;
    return 64; // fallback when mask not yet received
  }, [mask, answerLen]);

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
  <div className="flex items-start md:items-center gap-3 sm:gap-4 w-full">
    <div className="flex-1 min-w-0">
      {/* Hidden input (screen reader only). Click below to focus it. */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        autoFocus
        className="sr-only"
        maxLength={Math.max(0, slots)}
        value={typed}
        onChange={onHiddenChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitAnswer();
        }}
      />

      {/* Маска ответа — кликабельная «капсула»-карточка */}
      <div
        data-testid="mask-display"
        className="
          px-4 py-3
          min-w-0 w-full max-w-full
          rounded-2xl
          bg-white
          text-slate-900
          whitespace-pre-wrap break-words font-mono text-base min-h-[44px] cursor-text
          shadow-[0_12px_24px_-8px_rgba(99,102,241,0.5)]
          border-2 border-indigo-700
          transition-all duration-300 ease-in-out
          hover:translate-y-[-1px] hover:shadow-[0_16px_28px_-8px_rgba(99,102,241,0.6)]
          focus-visible:outline-none
        "
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
              <span className="font-['Dosis',sans-serif]">
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
            <span className="font-['Dosis',sans-serif]">
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

      {/* Сообщения */}
      {nearMissAt && typed.length === 0 && (
        <div
          className="
            mt-2 inline-flex items-center gap-2 text-sm
            px-3 py-1 rounded-full
            bg-gradient-to-br from-[#F5B041] to-[#F18F01]
            text-white
            shadow-[0_8px_15px_-3px_rgba(241,143,1,0.4)]
          "
        >
          ⚠️ В слове ошибка, попробуйте ещё раз
        </div>
      )}
      {hintErrorMsg && (
        <div
          className="
            mt-2 inline-flex items-center gap-2 text-sm
            px-3 py-1 rounded-full
            bg-gradient-to-br from-[#feb692] to-[#ea5455]
            text-white
            shadow-[0_20px_30px_-6px_rgba(238,103,97,0.5)]
          "
        >
          {hintErrorMsg}
        </div>
      )}
    </div>

    {/* Кнопки действий */}
    <div className="flex flex-col gap-2 self-start">
      <button
        onClick={submitAnswer}
        className="
          px-4 py-2
          rounded-[50px]
          text-sm md:text-base whitespace-nowrap
          bg-gradient-to-br from-emerald-400 to-emerald-600
          text-white font-medium
          shadow-[0_12px_22px_-6px_rgba(16,185,129,0.45)]
          transition-all duration-300 ease-in-out
          hover:translate-y-[2px] hover:shadow-[0_16px_28px_-8px_rgba(16,185,129,0.55)]
          active:opacity-50
          cursor-pointer
          font-['Dosis',sans-serif]
        "
        title="Отправить ответ"
      >
        Ответить
      </button>

      {mode === 'solo' && (canRevealHint ? (
        <button
          onClick={onHintClick}
          className={`
            px-4 py-2
            rounded-[50px]
            text-sm md:text-base whitespace-nowrap font-['Dosis',sans-serif]
            transition-all duration-300 ease-in-out cursor-pointer
            ${
              hintMode
                ? 'bg-gradient-to-br from-[#F5B041] to-[#F18F01] text-white shadow-[0_8px_15px_-3px_rgba(241,143,1,0.4)] hover:translate-y-[2px] hover:shadow-none active:opacity-50'
                : 'bg-gradient-to-br from-amber-200 to-amber-300 text-amber-900 shadow-[0_6px_14px_-4px_rgba(245,158,11,0.35)] hover:translate-y-[2px] hover:shadow-none active:opacity-50'
            }
          `}
          title={hintMode ? 'Режим подсказки активен' : 'Открыть режим подсказки'}
        >
          Подсказка
        </button>
      ) : (
        <button
          onClick={() => openShop()}
          className="
            px-4 py-2
            rounded-[50px]
            text-sm md:text-base whitespace-nowrap
            bg-gradient-to-br from-[#4A9FD8] to-[#2E86AB]
            text-white font-medium
            shadow-[0_20px_30px_-6px_rgba(46,134,171,0.5)]
            transition-all duration-300 ease-in-out
            hover:translate-y-[2px] hover:shadow-none
            active:opacity-50
            cursor-pointer
            font-['Dosis',sans-serif]
          "
          title="Магазин подсказок"
        >
          Купить подсказки
        </button>
      ))}
    </div>
  </div>
)}
      {showMeta && mode === 'solo' && !paused && (
        <button
          onClick={onPause}
          className="
            px-4 py-2
            rounded-[50px]
            text-sm md:text-base whitespace-nowrap
            bg-gradient-to-br from-[#F5B041] to-[#F18F01]
            text-white font-medium
            shadow-[0_8px_15px_-3px_rgba(241,143,1,0.4)]
            transition-all duration-300 ease-in-out
            hover:translate-y-[2px] hover:shadow-none
            active:opacity-50
            cursor-pointer
            font-['Dosis',sans-serif]
          "
          title='Поставить игру на паузу'
        >
          Пауза
        </button>
      )}

      {showMeta && mode === 'solo' && paused && (
        <button
          onClick={onResume}
          className="
            px-4 py-2
            rounded-[50px]
            text-sm md:text-base whitespace-nowrap
            bg-gradient-to-br from-emerald-400 to-emerald-600
            text-white font-medium
            shadow-[0_12px_22px_-6px_rgba(16,185,129,0.45)]
            transition-all duration-300 ease-in-out
            hover:translate-y-[2px] hover:shadow-[0_16px_28px_-8px_rgba(16,185,129,0.55)]
            active:opacity-50
            cursor-pointer
            font-['Dosis',sans-serif]
          "
          title='Продолжить игру'
        >
          Продолжить
        </button>
      )}

      {showMeta && (
        <button
          onClick={onLeave}
          className="
            ml-auto px-4 py-2
            rounded-[50px]
            text-sm md:text-base whitespace-nowrap
            bg-gradient-to-br from-[#feb692] to-[#ea5455]
            text-white font-medium
            shadow-[0_20px_30px_-6px_rgba(238,103,97,0.5)]
            transition-all duration-300 ease-in-out
            hover:translate-y-[2px] hover:shadow-none
            active:opacity-50
            cursor-pointer
            font-['Dosis',sans-serif]
          "
          title='Выйти из игры'
        >
          Выйти
        </button>
      )}
    </div>
  );
}

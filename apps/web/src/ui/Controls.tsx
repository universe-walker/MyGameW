import { useState } from 'react';

export type ControlsProps = {
  onAnswer: (text: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onLeave: () => void;
  isMyTurnToAnswer: boolean;
  solo: boolean;
};

export function Controls({ onAnswer, onPause, onResume, onLeave, isMyTurnToAnswer, solo }: ControlsProps) {
  const [answer, setAnswer] = useState('');
  const submitAnswer = () => {
    if (!isMyTurnToAnswer || !answer.trim()) return;
    onAnswer(answer.trim());
    setAnswer('');
  };

  return (
    <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
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
          <button
            onClick={submitAnswer}
            className="px-3 py-2 rounded bg-green-600 text-white text-sm md:text-base"
          >
            Ответить
          </button>
          <div className="text-xs text-green-700">Ваш ход</div>
        </div>
      )}
      {solo && (
        <>
          <button
            onClick={onPause}
            className="px-3 py-2 rounded bg-gray-200 text-sm md:text-base whitespace-nowrap"
          >
            Пауза
          </button>
          <button
            onClick={onResume}
            className="px-3 py-2 rounded bg-gray-200 text-sm md:text-base whitespace-nowrap"
          >
            Продолжить
          </button>
        </>
      )}
      <button
        onClick={onLeave}
        className="ml-auto px-3 py-2 rounded bg-red-100 text-red-700 text-sm md:text-base whitespace-nowrap"
      >
        Выйти
      </button>
    </div>
  );
}

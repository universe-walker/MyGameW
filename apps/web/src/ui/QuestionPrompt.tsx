import type { CurrentQuestion } from '../state/store';
import { useGameStore } from '../state/store';
import type { ReactNode } from 'react';

export type QuestionPromptProps = {
  question?: CurrentQuestion;
  // Current round number (1-based). In round >= 2, values are doubled.
  round?: number;
  children?: ReactNode;
};

export function QuestionPrompt({ question, round = 1, children }: QuestionPromptProps) {
  const reveal = useGameStore((s) => s.revealAnswer);
  if (!question && !reveal) return null;
  return (
    <div className="p-3 rounded bg-yellow-50 border border-yellow-200 space-y-2">
      {question && (
        <>
          <div className="text-xs text-yellow-700">
            {question.category} — {round >= 2 ? question.value * 2 : question.value}
          </div>
          <div className="mt-1 text-lg">{question.prompt}</div>
        </>
      )}
      {reveal && (
        <div className="mt-2 p-2 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
          Правильный ответ: <span className="font-semibold">{reveal}</span>
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}


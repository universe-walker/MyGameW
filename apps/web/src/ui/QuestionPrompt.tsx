import type { CurrentQuestion } from '../state/store';
import { useGameStore } from '../state/store';

export type QuestionPromptProps = {
  question?: CurrentQuestion;
};

export function QuestionPrompt({ question }: QuestionPromptProps) {
  const reveal = useGameStore((s) => s.revealAnswer);
  if (!question && !reveal) return null;
  return (
    <div className="p-3 rounded bg-yellow-50 border border-yellow-200 space-y-2">
      {question && (
        <>
          <div className="text-xs text-yellow-700">
            {question.category} — {question.value}
          </div>
          <div className="mt-1 text-lg">{question.prompt}</div>
        </>
      )}
      {reveal && (
        <div className="mt-2 p-2 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
          Правильный ответ: <span className="font-semibold">{reveal}</span>
        </div>
      )}
    </div>
  );
}


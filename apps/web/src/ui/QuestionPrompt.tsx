import type { CurrentQuestion } from '../state/store';

export type QuestionPromptProps = {
  question?: CurrentQuestion;
};

export function QuestionPrompt({ question }: QuestionPromptProps) {
  if (!question) return null;
  return (
    <div className="p-3 rounded bg-yellow-50 border border-yellow-200">
      <div className="text-xs text-yellow-700">
        {question.category} · {question.value}
      </div>
      <div className="mt-1 text-lg">{question.prompt}</div>
    </div>
  );
}


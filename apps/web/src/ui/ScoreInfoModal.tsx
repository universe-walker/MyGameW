import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  score: number;
};

export default function ScoreInfoModal({ open, onClose, score }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-white to-gray-50 w-full max-w-md rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-gray-200 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl shadow-lg">
            i
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Очки и рейтинг</h2>
            <p className="text-sm text-gray-500">Как считаются очки в мультиплеере</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border-2 border-gray-100 mb-4">
          <div className="text-sm text-gray-500">Ваш текущий рейтинг</div>
          <div className="text-2xl font-bold text-gray-900">{score}</div>
        </div>

        <div className="space-y-2 text-sm text-gray-700 mb-6">
          <div>• В мультиплеере очки матча идут в личный рейтинг.</div>
          <div>• Победителю начисляется x2 от набранных положительных очков матча.</div>
          <div>• Отрицательные очки списываются только если текущий рейтинг &gt; 0 и рейтинг не падает ниже 0.</div>
          <div>• Пример: у вас 1 очко и матч на −200 → спишется только 1, станет 0.</div>
        </div>

        <button
          className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-medium transition-all duration-200 hover:bg-gray-200 active:opacity-50"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}


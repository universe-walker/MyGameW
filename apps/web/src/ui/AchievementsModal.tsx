import React from 'react';

interface AchievementsModalProps {
  open: boolean;
  onClose: () => void;
}

export function AchievementsModal({ open, onClose }: AchievementsModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded p-4 w-96" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-semibold mb-2">Достижения</div>
        <div className="text-sm text-gray-500">Скоро здесь будет список бейджей и прогресс.</div>
        <button className="mt-4 w-full py-2 rounded bg-gray-200" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default AchievementsModal;

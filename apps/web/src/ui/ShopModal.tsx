import React from 'react';

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShopModal({ open, onClose }: ShopModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded p-4 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-semibold mb-2">Подсказки</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>Открыть 1 букву</div>
            <button className="px-3 py-1 rounded bg-blue-600 text-white">Купить</button>
          </div>
          <div className="flex items-center justify-between">
            <div>Пакет 2 буквы</div>
            <button className="px-3 py-1 rounded bg-blue-600 text-white">Купить</button>
          </div>
        </div>
        <button className="mt-4 w-full py-2 rounded bg-gray-200" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default ShopModal;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchApi } from '../lib/api';
import { getUser, onInvoiceClosed, offInvoiceClosed, openInvoice } from '../lib/telegram';
import type { TBillingPacksRes } from '@mygame/shared';

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  onPurchaseCompleted?: () => void;
}

export function ShopModal({ open, onClose, onPurchaseCompleted }: ShopModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = getUser();

  const [packs, setPacks] = useState<Array<{ qty: number; price: number }>>([]);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [packsLoading, setPacksLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    setPacksLoading(true);
    setPacksError(null);
    fetchApi('/billing/packs')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as TBillingPacksRes;
        setPacks(j.items.sort((a: { qty: number; price: number }, b: { qty: number; price: number }) => a.qty - b.qty));
      })
      .catch((e) => {
        console.error('[Shop] packs load error', e);
        setPacksError('Не удалось загрузить цены');
      })
      .finally(() => setPacksLoading(false));
  }, [open]);

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleInvoiceClosed = useCallback(
    async (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => {
      if (!mountedRef.current) return;
      setPending(false);
      if (data.status === 'paid') {
        onPurchaseCompleted?.();
        onClose();
      } else if (data.status === 'failed') {
        setError('Платёж не прошёл. Попробуйте ещё раз.');
      }
    },
    [onClose, onPurchaseCompleted],
  );

  useEffect(() => {
    if (!open) return;
    onInvoiceClosed(handleInvoiceClosed);
    return () => offInvoiceClosed(handleInvoiceClosed);
  }, [open, handleInvoiceClosed]);

  const buy = useCallback(
    async (qty: number) => {
      setError(null);
      if (!user?.id) {
        setError('Покупка доступна только в Telegram (WebApp).');
        return;
      }
      setPending(true);
      try {
        const res = await fetchApi(`/billing/invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, type: 'hint_letter', qty }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { invoiceLink: string };
        if (!json.invoiceLink) throw new Error('invoiceLink отсутствует в ответе');
        openInvoice(json.invoiceLink, async (status) => {
          if (status === 'paid') {
            onPurchaseCompleted?.();
            onClose();
          } else if (status === 'failed') {
            setError('Платёж не прошёл. Попробуйте ещё раз.');
          }
          setPending(false);
        });
      } catch (e: any) {
        console.error('[Shop] buy error', e);
        setError(e?.message || 'Произошла ошибка. Попробуйте позже.');
        setPending(false);
      }
    },
    [user?.id, onClose, onPurchaseCompleted],
  );

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 w-full max-w-md shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-2xl shadow-lg">
            ⭐️
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Магазин подсказок</h2>
            <p className="text-sm text-gray-500">Покупка за Telegram Stars</p>
          </div>
        </div>

        {/* Варианты покупки */}
        <div className="space-y-3 mb-6">
          {packsLoading && (
            <div className="text-sm text-gray-500">Загрузка цен…</div>
          )}
          {packsError && !packsLoading && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-3 text-sm text-yellow-800">
              {packsError}
            </div>
          )}
          {!packsLoading && !packsError && packs.length === 0 && (
            <div className="text-sm text-gray-500">Нет доступных пакетов</div>
          )}
          {packs.map((p) => (
            <div key={p.qty} className="bg-white rounded-xl p-4 border-2 border-gray-100 hover:border-orange-200 transition-all duration-300 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⭐️×{p.qty}</span>
                  <div>
                    <div className="font-semibold text-gray-800">Буква подсказки: {p.qty} шт</div>
                    <div className="text-xs text-gray-500">Цена: {p.price} зв</div>
                  </div>
                </div>
                <button
                  className="px-5 py-2.5 rounded-full bg-gradient-to-br from-[#4A9FD8] to-[#2E86AB] shadow-[0_8px_15px_-3px_rgba(46,134,171,0.4)] text-white font-semibold text-sm transition-all duration-300 ease-in-out hover:translate-y-[2px] hover:shadow-none active:opacity-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  onClick={() => buy(p.qty)}
                  disabled={pending}
                >
                  Купить
                </button>
              </div>
            </div>
          ))}

          {/* Ошибка */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
        </div>

        {/* Кнопка закрытия */}
        <button
          className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-medium transition-all duration-200 hover:bg-gray-200 active:opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onClose}
          disabled={pending}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default ShopModal;

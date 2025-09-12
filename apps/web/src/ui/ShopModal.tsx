import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchApi } from '../lib/api';
import { getUser, onInvoiceClosed, offInvoiceClosed, openInvoice } from '../lib/telegram';

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  onPurchaseCompleted?: () => void;
}

export function ShopModal({ open, onClose, onPurchaseCompleted }: ShopModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = getUser();

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
        try {
          // Try to credit server-side in WebApp context for immediate balance update
          await fetchApi(`/billing/credit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'hint_letter', qty: 1 }),
          });
        } catch {}
        onPurchaseCompleted?.();
        onClose();
      } else if (data.status === 'failed') {
        setError('Оплата не прошла. Попробуйте еще раз.');
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
    async (qty: 1 | 2) => {
      setError(null);
      if (!user?.id) {
        setError('Пользователь не определен (Telegram WebApp).');
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
            try {
              await fetchApi(`/billing/credit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'hint_letter', qty }),
              });
            } catch {}
            onPurchaseCompleted?.();
            onClose();
          } else if (status === 'failed') {
            setError('Оплата не прошла. Попробуйте еще раз.');
          }
          setPending(false);
        });
      } catch (e: any) {
        console.error('[Shop] buy error', e);
        setError(e?.message || 'Ошибка при создании счета');
        setPending(false);
      }
    },
    [user?.id, onClose, onPurchaseCompleted],
  );

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded p-4 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-semibold mb-2">Покупки за Звезды</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>Открыть 1 букву</div>
            <button
              className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={() => buy(1)}
              disabled={pending}
            >
              Купить
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>Открыть 2 буквы</div>
            <button
              className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={() => buy(2)}
              disabled={pending}
            >
              Купить
            </button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <button className="mt-4 w-full py-2 rounded bg-gray-200" onClick={onClose} disabled={pending}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default ShopModal;

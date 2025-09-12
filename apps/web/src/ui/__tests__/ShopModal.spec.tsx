import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShopModal } from '../../ui/ShopModal';

// Mock fetchApi via global fetch used inside fetchApi
// apps/web/src/lib/api.ts uses fetch with headers set

declare global {
  interface Window {
    Telegram?: any;
  }
}

function mockTelegram() {
  let invoiceClosedCb: any | null = null;
  const openInvoice = vi.fn((_url: string, cb?: (status: 'paid' | 'cancelled' | 'failed') => void) => {
    // Keep a ref to fallback cb too
    (openInvoice as any)._cb = cb;
  });
  const onEvent = vi.fn((event: string, cb: any) => {
    if (event === 'invoiceClosed') invoiceClosedCb = cb;
  });
  const offEvent = vi.fn();
  (window as any).Telegram = { WebApp: { openInvoice, onEvent, offEvent, initDataUnsafe: { user: { id: 1, first_name: 'U' } } } };
  return { openInvoice, triggerClosed: (status: 'paid' | 'cancelled' | 'failed') => invoiceClosedCb?.({ url: 'u', status }) };
}

describe('ShopModal', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('/billing/invoice')) {
        return {
          ok: true,
          json: async () => ({ invoiceLink: 'https://t.me/invoice/mock' }),
          text: async () => 'ok',
        } as any;
      }
      if (u.includes('/profile')) {
        return { ok: true, json: async () => ({ profileScore: 0, hintAllowance: 2 }) } as any;
      }
      return { ok: true, json: async () => ({}), text: async () => '' } as any;
    }) as any;
  });
  afterEach(() => {
    global.fetch = originalFetch as any;
    delete (window as any).Telegram;
  });

  it('creates invoice and opens it, calls onPurchaseCompleted on paid', async () => {
    const { openInvoice, triggerClosed } = mockTelegram();
    const onCompleted = vi.fn();
    render(<ShopModal open={true} onClose={() => {}} onPurchaseCompleted={onCompleted} />);

    const btns = screen.getAllByRole('button', { name: /купить/i });
    fireEvent.click(btns[0]); // buy 1

    await waitFor(() => expect(openInvoice).toHaveBeenCalled());

    // Simulate payment closed with 'paid'
    triggerClosed('paid');

    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
  });

  it('shows error message on failed payment', async () => {
    const { openInvoice, triggerClosed } = mockTelegram();
    render(<ShopModal open={true} onClose={() => {}} />);
    const btn = screen.getAllByRole('button', { name: /купить/i })[0];
    fireEvent.click(btn);
    await waitFor(() => expect(openInvoice).toHaveBeenCalled());
    triggerClosed('failed');
    await waitFor(() => expect(screen.getByText(/оплата не прошла/i)).toBeInTheDocument());
  });
});

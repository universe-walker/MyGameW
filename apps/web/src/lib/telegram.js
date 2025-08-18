export function getInitDataRaw() {
    return window.Telegram?.WebApp?.initData ?? null;
}
export function getStartParam() {
    return window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
}
export function getUser() {
    return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}
export function openInvoice(url, cb) {
    const wa = window.Telegram?.WebApp;
    if (!wa?.openInvoice)
        throw new Error('Telegram WebApp.openInvoice not available');
    wa.openInvoice(url, cb);
}
export function onInvoiceClosed(cb) {
    const wa = window.Telegram?.WebApp;
    wa?.onEvent?.('invoiceClosed', cb);
}
export function offInvoiceClosed(cb) {
    const wa = window.Telegram?.WebApp;
    wa?.offEvent?.('invoiceClosed', cb);
}

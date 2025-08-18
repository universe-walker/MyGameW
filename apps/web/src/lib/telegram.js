export function getInitDataRaw() {
    return window.Telegram?.WebApp?.initData ?? null;
}
export function getStartParam() {
    return window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
}
export function getUser() {
    return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

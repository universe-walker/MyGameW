import { io } from 'socket.io-client';
let socket = null;
export function connectSocket(initDataRaw, userJson) {
    const url = import.meta.env.VITE_API_BASE_URL || window.API_BASE_URL || 'http://localhost:4000';
    socket = io(`${url}/game`, {
        transports: ['websocket'],
        auth: { initDataRaw, user: userJson },
    });
    return socket;
}
export function getSocket() {
    return socket;
}

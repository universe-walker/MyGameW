import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getStartParam, getUser } from '../lib/telegram';
import { connectSocket } from '../lib/socket';
import { useGameStore } from '../state/store';
export function App() {
    const [verified, setVerified] = useState(false);
    const setRoom = useGameStore((s) => s.setRoom);
    const roomId = useGameStore((s) => s.roomId);
    const players = useGameStore((s) => s.players);
    const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || window.API_BASE_URL || 'http://localhost:4000', []);
    const verify = useMutation({
        mutationFn: async (initDataRaw) => {
            const res = await fetch(`${apiBase}/auth/telegram/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initDataRaw }),
            });
            if (!res.ok)
                throw new Error('verify failed');
            return (await res.json());
        },
        onSuccess: () => setVerified(true),
    });
    useEffect(() => {
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        verify.mutate(initDataRaw);
        const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        socket.on('room:state', (state) => setRoom(state.roomId, state.players));
        const urlStartParam = new URLSearchParams(location.search).get('start_param');
        const start = getStartParam() ?? urlStartParam;
        if (start && start.startsWith('room_')) {
            const id = start.slice('room_'.length);
            socket.emit('rooms:join', { roomId: id });
        }
        else {
            fetch(`${apiBase}/rooms`, { method: 'POST' })
                .then((r) => r.json())
                .then((j) => socket.emit('rooms:join', { roomId: j.roomId }));
        }
    }, []);
    return (_jsx("div", { className: "min-h-full flex items-center justify-center p-6", children: _jsxs("div", { className: "w-full max-w-md space-y-4", children: [_jsx("h1", { className: "text-2xl font-bold", children: roomId ? `Комната ${roomId}` : 'Загрузка...' }), _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "font-medium", children: "\u0418\u0433\u0440\u043E\u043A\u0438" }), _jsx("ul", { className: "list-disc pl-6", children: players.map((p) => (_jsx("li", { children: p.name }, p.id))) })] }), _jsx("button", { className: "w-full py-2 rounded bg-gray-300 text-gray-600 cursor-not-allowed", disabled: true, children: "\u0421\u0438\u0433\u043D\u0430\u043B" }), !verified && _jsx("div", { className: "text-sm text-red-500", children: "\u0412\u0435\u0440\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044F..." })] }) }));
}

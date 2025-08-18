import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getStartParam, getUser } from '../lib/telegram';
import { connectSocket } from '../lib/socket';
import { useGameStore } from '../state/store';
import { useUiHome } from '../state/ui';
export function App() {
    const [verified, setVerified] = useState(false);
    const setRoom = useGameStore((s) => s.setRoom);
    const setPhase = useGameStore((s) => s.setPhase);
    const setBotStatus = useGameStore((s) => s.setBotStatus);
    const roomId = useGameStore((s) => s.roomId);
    const solo = useGameStore((s) => s.solo);
    const players = useGameStore((s) => s.players);
    const phase = useGameStore((s) => s.phase);
    const until = useGameStore((s) => s.until);
    const botStatuses = useGameStore((s) => s.botStatuses);
    const { shopOpen, achievementsOpen, openShop, closeShop, openAchievements, closeAchievements } = useUiHome();
    const [profileScore, setProfileScore] = useState(0);
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
        socket.on('room:state', (state) => setRoom(state.roomId, state.players, Boolean(state.solo)));
        socket.on('game:phase', (p) => setPhase(p.phase, p.until));
        socket.on('bot:status', (b) => setBotStatus(b.playerId, b.status));
        const urlStartParam = new URLSearchParams(location.search).get('start_param');
        const start = getStartParam() ?? urlStartParam;
        if (start && start.startsWith('room_')) {
            const id = start.slice('room_'.length);
            socket.emit('rooms:join', { roomId: id });
        }
        else {
            // Do not auto-join; wait for user action on Home screen
        }
        // Try loading profile score when possible
        if (user) {
            fetch(`${apiBase}/profile?userId=${user.id}`).then(async (r) => {
                if (r.ok) {
                    const j = (await r.json());
                    if (typeof j.profileScore === 'number')
                        setProfileScore(j.profileScore);
                }
            });
        }
    }, []);
    const onFindGame = async () => {
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        // Auto create or join a public room
        const res = await fetch(`${apiBase}/rooms`, { method: 'POST' });
        const j = (await res.json());
        socket.emit('rooms:join', { roomId: j.roomId });
    };
    const onSoloGame = async () => {
        // Create a solo room and auto-join
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        const res = await fetch(`${apiBase}/rooms/solo`, { method: 'POST' });
        const j = (await res.json());
        socket.emit('rooms:join', { roomId: j.roomId });
    };
    const onBuzzer = () => {
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        if (roomId)
            socket.emit('buzzer:press', { roomId });
    };
    const onPause = () => {
        if (!roomId)
            return;
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        socket.emit('solo:pause', { roomId });
    };
    const onResume = () => {
        if (!roomId)
            return;
        const initDataRaw = getInitDataRaw() ?? '';
        const user = getUser();
        const socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
        socket.emit('solo:resume', { roomId });
    };
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!until)
            return;
        const id = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(id);
    }, [until]);
    const remainingMs = until ? Math.max(0, until - now) : undefined;
    return (_jsxs("div", { className: "min-h-full flex flex-col p-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "text-xl font-bold", children: "MyGame" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { className: "text-sm px-2 py-1 rounded bg-gray-100", onClick: openAchievements, children: "\uD83C\uDFC6 \u0414\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u044F" }), _jsxs("div", { className: "text-sm px-2 py-1 rounded bg-yellow-100", children: ["\u2B50 \u0421\u0447\u0451\u0442: ", profileScore] }), _jsx("button", { className: "text-sm px-2 py-1 rounded bg-gray-100", onClick: openShop, children: "\uD83D\uDED2 \u041C\u0430\u0433\u0430\u0437\u0438\u043D" })] })] }), !roomId ? (
            // Main actions
            _jsxs("div", { className: "grow flex flex-col items-center justify-center gap-4", children: [_jsx("button", { className: "w-full max-w-md py-4 text-lg rounded bg-blue-600 text-white", onClick: onFindGame, children: "\u041D\u0430\u0439\u0442\u0438 \u0438\u0433\u0440\u0443" }), _jsx("button", { className: "w-full max-w-md py-4 text-lg rounded bg-indigo-600 text-white", onClick: onSoloGame, children: "\u041E\u0434\u0438\u043D\u043E\u0447\u043D\u0430\u044F \u0438\u0433\u0440\u0430" }), !verified && _jsx("div", { className: "text-sm text-gray-500", children: "\u0412\u0435\u0440\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044F..." })] })) : (
            // Match screen (basic)
            _jsxs("div", { className: "grow flex flex-col gap-4", children: [_jsxs("div", { className: "p-3 rounded bg-gray-100 flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "font-semibold", children: ["\u0424\u0430\u0437\u0430: ", phase] }), remainingMs !== undefined && _jsxs("div", { className: "text-sm text-gray-600", children: ["\u0414\u043E \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F: ", (remainingMs / 1000).toFixed(1), "\u0441"] })] }), solo && (_jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "px-3 py-1 rounded bg-gray-200", onClick: onPause, children: "\u041F\u0430\u0443\u0437\u0430" }), _jsx("button", { className: "px-3 py-1 rounded bg-gray-200", onClick: onResume, children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] }))] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: players.map((p) => (_jsxs("div", { className: "p-3 rounded border flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "font-medium", children: [p.name, " ", p.bot ? '🤖' : '🧑'] }), _jsx("div", { className: "text-sm text-gray-600", children: botStatuses[p.id] ?? 'idle' })] }), !p.bot && (_jsx("button", { className: "px-3 py-2 rounded bg-red-600 text-white", onClick: onBuzzer, disabled: phase !== 'buzzer_window', children: "\u0416\u041C\u0418!" }))] }, p.id))) })] })), shopOpen && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center", onClick: closeShop, children: _jsxs("div", { className: "bg-white rounded p-4 w-80", onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "text-lg font-semibold mb-2", children: "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438" }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C 1 \u0431\u0443\u043A\u0432\u0443" }), _jsx("button", { className: "px-3 py-1 rounded bg-blue-600 text-white", children: "\u041A\u0443\u043F\u0438\u0442\u044C" })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { children: "\u041F\u0430\u043A\u0435\u0442 2 \u0431\u0443\u043A\u0432\u044B" }), _jsx("button", { className: "px-3 py-1 rounded bg-blue-600 text-white", children: "\u041A\u0443\u043F\u0438\u0442\u044C" })] })] }), _jsx("button", { className: "mt-4 w-full py-2 rounded bg-gray-200", onClick: closeShop, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }) })), achievementsOpen && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center", onClick: closeAchievements, children: _jsxs("div", { className: "bg-white rounded p-4 w-96", onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "text-lg font-semibold mb-2", children: "\u0414\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u044F" }), _jsx("div", { className: "text-sm text-gray-500", children: "\u0421\u043A\u043E\u0440\u043E \u0437\u0434\u0435\u0441\u044C \u0431\u0443\u0434\u0435\u0442 \u0441\u043F\u0438\u0441\u043E\u043A \u0431\u0435\u0439\u0434\u0436\u0435\u0439 \u0438 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441." }), _jsx("button", { className: "mt-4 w-full py-2 rounded bg-gray-200", onClick: closeAchievements, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }) }))] }));
}

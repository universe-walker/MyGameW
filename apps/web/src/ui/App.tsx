import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getInitDataRaw, getUser, getAuthDate, TELEGRAM_INIT_DATA_TTL_SECONDS, logInitDataDiagnostics } from '../lib/telegram';
import { fetchApi, apiBase } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../state/store';
import { useUiHome } from '../state/ui';
import { Match } from './Match';
import DebugConsole from './DebugConsole';
import ShopModal from './ShopModal';
import ScoreInfoModal from './ScoreInfoModal';
import AchievementsModal from './AchievementsModal';

export function App() {
  const [verified, setVerified] = useState(false);
  const roomId = useGameStore((s) => s.roomId);
  const mode = useGameStore((s) => s.mode);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const setPaused = useGameStore((s) => s.setPaused);
  const { shopOpen, achievementsOpen, openShop, closeShop, openAchievements, closeAchievements } = useUiHome();
  const [profileScore, setProfileScore] = useState<number>(0);
  const [hintAllowance, setHintAllowance] = useState<number>(0);
  const [scoreInfoOpen, setScoreInfoOpen] = useState<boolean>(false);
  const testHintAllowance = Number(import.meta.env.VITE_TEST_HINTS);
  useEffect(() => {
    if (testHintAllowance > 0) setHintAllowance(testHintAllowance);
  }, [testHintAllowance]);
  const [, setGameStarted] = useState(false);

  const showDebugConsole = (() => {
    const mode = (import.meta as any).env?.MODE as string | undefined;
    const flag = (import.meta as any).env?.VITE_DEBUG_CONSOLE as string | undefined;
    // Defaults: dev -> ON, prod -> OFF. Can override via VITE_DEBUG_CONSOLE.
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return mode !== 'production';
  })();

  const { connect, disconnect, getSocket } = useSocket();

  // Close home-only modals when a match starts (solo or multiplayer)
  useEffect(() => {
    if (roomId) {
      try { closeShop(); } catch {}
      try { closeAchievements(); } catch {}
    }
  }, [roomId, closeShop, closeAchievements]);

  const verify = useMutation({
    mutationFn: async (initDataRaw: string) => {
      const res = await fetchApi(`/auth/telegram/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initDataRaw }),
      });
      if (!res.ok) throw new Error('verify failed');
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => {
      console.log('[auth] verify: ok');
      setVerified(true);
    },
    onError: (err) => {
      console.error('[auth] verify: failed', err);
    },
  });

  useEffect(() => {
    const initDataRaw = getInitDataRaw() ?? '';
    logInitDataDiagnostics('App.mount');
    const user = getUser();
    verify.mutate(initDataRaw);
    // API health check
    (async () => {
      try {
        console.log('[health] apiBase =', apiBase);
        const r = await fetch(`${apiBase}/healthz`);
        const t = await r.text().catch(() => '');
        console.log('[health] GET /healthz ->', r.status, t);
      } catch (e) {
        console.error('[health] GET /healthz failed', e);
      }
    })();

    // Load profile (score and hint balance)
    if (user) {
      fetchApi(`/profile`).then(async (r) => {
        if (r.ok) {
          const j = (await r.json()) as { profileScore: number; hintAllowance?: number };
          if (typeof j.profileScore === 'number') setProfileScore(j.profileScore);
          if (typeof j.hintAllowance === 'number') setHintAllowance(j.hintAllowance);
        }
      });
    }
  }, []);

  // Refresh profile when returning to home (e.g., after leaving a match)
  // Fixes: hint balance could appear stale/zero until full reload
  useEffect(() => {
    if (roomId) return; // only when not in a room
    const user = getUser();
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchApi(`/profile`);
        if (!cancelled && r.ok) {
          const j = (await r.json()) as { profileScore: number; hintAllowance?: number };
          if (typeof j.profileScore === 'number') setProfileScore(j.profileScore);
          if (typeof j.hintAllowance === 'number') setHintAllowance(j.hintAllowance);
        }
      } catch (e) {
        console.error('[ui] refresh profile after leaving match failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const onFindGame = async () => {
    console.log('[ui] onFindGame: click');
    setGameStarted(true);
    try {
      const socket = connect();
      console.log('[ui] onFindGame: POST /rooms');
      const res = await fetchApi(`/rooms`, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[ui] onFindGame: rooms create failed', res.status, txt);
        logInitDataDiagnostics('onFindGame.fail');
        return;
      }
      const j = (await res.json()) as { roomId: string };
      console.log('[ui] onFindGame: /rooms ok -> join', j);
      socket?.emit('rooms:join', { roomId: j.roomId });
      console.log('[ui] onFindGame: emitted rooms:join', j.roomId);
    } catch (e) {
      console.error('[ui] onFindGame: error', e);
    }
  };

  const onSoloGame = async () => {
    // Create a solo room and auto-join
    console.log('[ui] onSoloGame: click');
    setGameStarted(true);
    try {
      const socket = connect();
      console.log('[ui] onSoloGame: POST /rooms/solo');
      const res = await fetchApi(`/rooms/solo`, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[ui] onSoloGame: rooms/solo failed', res.status, txt);
        logInitDataDiagnostics('onSoloGame.fail');
        return;
      }
      const j = (await res.json()) as { roomId: string };
      console.log('[ui] onSoloGame: /rooms/solo ok -> join', j);
      socket?.emit('rooms:join', { roomId: j.roomId });
      console.log('[ui] onSoloGame: emitted rooms:join', j.roomId);
    } catch (e) {
      console.error('[ui] onSoloGame: error', e);
    }
  };

  const onAnswer = (text: string) => {
    const socket = getSocket();
    if (roomId && socket && text.trim()) {
      socket.emit('answer:submit', { roomId, text: text.trim() });
    }
  };

  const onPause = () => {
    if (!roomId) return;
    const socket = getSocket();
    socket?.emit('solo:pause', { roomId });
    setPaused(true);
  };
  const onResume = () => {
    if (!roomId) return;
    const socket = getSocket();
    socket?.emit('solo:resume', { roomId });
    setPaused(false);
  };

  const onLeave = () => {
    const socket = getSocket();
    if (socket && roomId) socket.emit('rooms:leave', { roomId });
    disconnect();
    leaveRoom();
    setGameStarted(false);
  };

  return (
    <div className="min-h-full flex flex-col p-4 bg-[#F5F5F5]">
      {/* AppBar (hidden during any active match) */}
      {!roomId && (
        <div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xl font-bold text-center sm:text-left">MyGame</div>
          <div className="w-full sm:w-auto flex flex-wrap items-center justify-center sm:justify-end gap-2">
            <div className="
                text-sm px-4 py-2 
                rounded-full
                bg-gradient-to-br from-[#F5B041] to-[#F18F01]
                shadow-[0_8px_15px_-3px_rgba(241,143,1,0.4)]
                text-white font-medium
                transition-all duration-300 ease-in-out
                hover:translate-y-[2px] hover:shadow-none
                active:opacity-50
                cursor-pointer
                flex items-center gap-2
              " onClick={() => setScoreInfoOpen(true)} >🏆 Очки: {profileScore}</div>
            <div className="
                text-sm px-4 py-2 
                rounded-full
                bg-gradient-to-br from-[#F5B041] to-[#F18F01]
                shadow-[0_8px_15px_-3px_rgba(241,143,1,0.4)]
                text-white font-medium
                transition-all duration-300 ease-in-out
                hover:translate-y-[2px] hover:shadow-none
                active:opacity-50
                cursor-pointer
                flex items-center gap-2
              " >💡 Подсказки: {hintAllowance}</div>
            <button id="open-shop-btn" className="
                text-sm px-4 py-2 
                rounded-full
                bg-gradient-to-br from-[#F5B041] to-[#F18F01]
                shadow-[0_8px_15px_-3px_rgba(241,143,1,0.4)]
                text-white font-medium
                transition-all duration-300 ease-in-out
                hover:translate-y-[2px] hover:shadow-none
                active:opacity-50
                cursor-pointer
                flex items-center gap-2
              "  onClick={openShop}>Магазин</button>
          </div>
        </div>
      )}

      {roomId ? (
        <div className="grow">
          <Match onAnswer={onAnswer} onPause={onPause} onResume={onResume} onLeave={onLeave} />
        </div>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-4">
          {hintAllowance === 0 && (
            <div className="
  w-full max-w-md 
  bg-gradient-to-br from-amber-50 to-orange-100
  rounded-2xl
  p-6
  shadow-[0_10px_25px_-5px_rgba(251,146,60,0.3)]
  border border-orange-200
">
  <div className="flex items-start gap-4">
    <div className="
      flex-shrink-0
      w-12 h-12
      bg-gradient-to-br from-orange-400 to-orange-500
      rounded-full
      flex items-center justify-center
      text-2xl
      shadow-lg
    ">
      💡
    </div>
    <div className="flex-1">
      <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
        <span>Нет подсказок</span>
      </h3>
      <p className="text-gray-600 mb-4 text-sm">
        Купите подсказки за Звезды ⭐ в магазине, чтобы получить преимущество в игре!
      </p>
      <button 
        className="
          px-6 py-3 
          rounded-full
          bg-gradient-to-br from-[#F5B041] to-[#F18F01]
          shadow-[0_8px_15px_-3px_rgba(241,143,1,0.4)]
          text-white font-semibold text-sm
          transition-all duration-300 ease-in-out
          hover:translate-y-[2px] hover:shadow-none
          active:opacity-50
          cursor-pointer
          flex items-center gap-2
        "
        onClick={openShop}
      >
        <span>🛒</span>
        Открыть магазин
      </button>
    </div>
  </div>
</div>
          )}
          <button className="w-full max-w-md py-4 text-lg rounded-[50px] bg-gradient-to-br from-[#4A9FD8] to-[#2E86AB] shadow-[0_20px_30px_-6px_rgba(46,134,171,0.5)] text-white transition-all duration-300 ease-in-out hover:translate-y-[3px] hover:shadow-none active:opacity-50 cursor-pointer" onClick={onFindGame}>
            Многопользовательская игра
          </button>
          <button className="w-full max-w-md py-4 text-lg rounded-[50px] bg-gradient-to-br from-[#4A9FD8] to-[#2E86AB] shadow-[0_20px_30px_-6px_rgba(46,134,171,0.5)] text-white transition-all duration-300 ease-in-out hover:translate-y-[3px] hover:shadow-none active:opacity-50 cursor-pointer" onClick={onSoloGame}>
            Одиночная игра
          </button>
          {!verified && <div className="text-sm text-gray-500">Инициализация...</div>}
        </div>
      )}

      {/* Modals */}
      <ShopModal
        open={shopOpen}
        onClose={closeShop}
        onPurchaseCompleted={async () => {
          const prev = hintAllowance;
          const attempts = 6;
          for (let i = 0; i < attempts; i++) {
            const r = await fetchApi(`/profile`);
            if (r.ok) {
              const j = (await r.json()) as { profileScore: number; hintAllowance?: number };
              if (typeof j.profileScore === 'number') setProfileScore(j.profileScore);
              if (typeof j.hintAllowance === 'number') {
                setHintAllowance(j.hintAllowance);
                if (j.hintAllowance > prev) break; // balance updated
              }
            }
            if (i < attempts - 1) await new Promise((res) => setTimeout(res, 500));
          }
        }}
      />
      <ScoreInfoModal open={scoreInfoOpen} onClose={() => setScoreInfoOpen(false)} score={profileScore} />
      <AchievementsModal open={achievementsOpen} onClose={closeAchievements} />
      {showDebugConsole && <DebugConsole />}
    </div>
  );
}

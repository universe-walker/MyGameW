import { useCallback } from 'react';
import type { Socket, TRoomState, TGamePhaseEvent, TBotStatus, TBoardState } from '@mygame/shared';
import { getInitDataRaw, getUser } from '../lib/telegram';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useGameStore } from '../state/store';

function setupSocketListeners(
  socket: Socket,
  setRoom: any,
  setPhase: any,
  setBotStatus: any,
  setBoard: any,
  setReveal: (text: string | null) => void,
  setMask: (mask: string | null, len?: number) => void,
  setCanRevealHint: (v: boolean) => void,
  setHintError: (msg: string | null) => void,
  onNearMiss: () => void,
) {
  console.log('[socket] setupSocketListeners: attaching listeners');
  socket.off('room:state');
  socket.off('game:phase');
  socket.off('bot:status');
  socket.off('board:state');
  socket.on('room:state', (state: TRoomState) => {
    console.log('[socket] event room:state', state);
    setRoom(state.roomId, state.players, Boolean(state.solo));
  });
  socket.on('game:phase', (p: TGamePhaseEvent) => {
    console.log('[socket] event game:phase', p);
    const anyp: any = p as any;
    const extras: any = { mode: anyp.mode, blitz: anyp.blitz ? { index: anyp.blitz.index, total: anyp.blitz.total } : undefined };
    setPhase(p.phase, p.until, p.activePlayerId ?? null, p.question, p.scores, extras);
    if (p.phase === 'prepare' || p.phase === 'answer_wait') setReveal(null);
    if (p.phase !== 'answer_wait') {
      setMask(null, 0);
      setCanRevealHint(false);
    }
  });
  socket.on('bot:status', (b: TBotStatus) => {
    console.log('[socket] event bot:status', b);
    setBotStatus(b.playerId, b.status);
  });
  socket.on('board:state', (b: TBoardState) => {
    console.log('[socket] event board:state', b);
    if (Array.isArray(b?.categories)) setBoard(b.categories);
  });
  socket.on('word:mask', (payload: any) => {
    console.log('[socket] event word:mask', payload);
    if (payload && typeof payload.mask === 'string') setMask(payload.mask, Number(payload.len) || 0);
    if (payload && typeof payload.canReveal === 'boolean') setCanRevealHint(Boolean(payload.canReveal));
  });

  socket.on('word:reveal', (payload: any) => {
    console.log('[socket] event word:reveal', payload);
    if (payload && typeof payload.position === 'number' && typeof payload.char === 'string') {
      const s = useGameStore.getState();
      const cur = s.answerMask ?? '';
      if (cur) {
        const arr = Array.from(cur);
        if (payload.position >= 0 && payload.position < arr.length) {
          arr[payload.position] = payload.char;
          setMask(arr.join(''), s.answerLen);
        }
      }
    }
  });

  socket.on('hint:error', (payload: any) => {
    console.log('[socket] event hint:error', payload);
    const msg = typeof payload?.message === 'string' ? payload.message : 'Ошибка подсказки';
    setHintError(msg);
  });

  socket.on('answer:reveal', (r: any) => {
    console.log('[socket] event answer:reveal', r);
    if (typeof r?.text === 'string') setReveal(r.text);
  });
  socket.on('answer:near_miss', (_p: any) => {
    console.log('[socket] event answer:near_miss');
    onNearMiss();
  });

  socket.on('answer:debug', (p: any) => {
    if (typeof p?.text === 'string') {
      console.debug('[DEBUG] Correct answer:', p.text);
    }
  });

  // Auto rejoin the room on (re)connect if we have one
  socket.on('connect', () => {
    const rid = useGameStore.getState().roomId;
    if (rid) {
      console.log('[socket] connect: auto rejoin room', rid);
      socket.emit('rooms:join', { roomId: rid });
    }
  });
}

export function useSocket() {
  const setRoom = useGameStore((s) => s.setRoom);
  const setPhase = useGameStore((s) => s.setPhase);
  const setBoard = useGameStore((s) => s.setBoard);
  const setBotStatus = useGameStore((s) => s.setBotStatus);
  const setReveal = useGameStore((s) => s.setRevealAnswer);
  const setMask = useGameStore((s) => s.setAnswerMask);
  const setCanRevealHint = useGameStore((s) => s.setCanRevealHint);
  const setHintError = useGameStore((s) => s.setHintError);
  const onNearMiss = useGameStore((s) => s.setNearMiss);

  const connect = useCallback(() => {
    let socket = getSocket();
    if (!socket) {
      const initDataRaw = getInitDataRaw() ?? '';
      const user = getUser();
      console.log('[ui] connecting socket, hasUser=', Boolean(user), 'initDataRaw.length=', initDataRaw.length);
      socket = connectSocket(initDataRaw);
      setupSocketListeners(socket, setRoom, setPhase, setBotStatus, setBoard, setReveal, setMask, setCanRevealHint, setHintError, onNearMiss);
    }
    return socket;
  }, [setRoom, setPhase, setBotStatus, setBoard]);

  const disconnect = useCallback(() => {
    disconnectSocket();
  }, []);

  return { connect, disconnect, getSocket };
}


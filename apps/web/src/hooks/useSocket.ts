import { useCallback } from 'react';
import type {
  Socket,
  TRoomState,
  TGamePhaseEvent,
  TBotStatus,
  TBoardState,
} from '@mygame/shared';
import { getInitDataRaw, getUser } from '../lib/telegram';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useGameStore } from '../state/store';

function setupSocketListeners(
  socket: Socket,
  setRoom: any,
  setPhase: any,
  setBotStatus: any,
  setBoard: any,
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
    setPhase(p.phase, p.until, p.activePlayerId ?? null, p.question);
  });
  socket.on('bot:status', (b: TBotStatus) => {
    console.log('[socket] event bot:status', b);
    setBotStatus(b.playerId, b.status);
  });
  socket.on('board:state', (b: TBoardState) => {
    console.log('[socket] event board:state', b);
    if (Array.isArray(b?.categories)) setBoard(b.categories);
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

  const connect = useCallback(() => {
    let socket = getSocket();
    if (!socket) {
      const initDataRaw = getInitDataRaw() ?? '';
      const user = getUser();
      console.log('[ui] connecting socket, hasUser=', Boolean(user), 'initDataRaw.length=', initDataRaw.length);
      socket = connectSocket(initDataRaw, user ? JSON.stringify(user) : undefined);
      setupSocketListeners(socket, setRoom, setPhase, setBotStatus, setBoard);
    }
    return socket;
  }, [setRoom, setPhase, setBotStatus, setBoard]);

  const disconnect = useCallback(() => {
    disconnectSocket();
  }, []);

  return { connect, disconnect, getSocket };
}


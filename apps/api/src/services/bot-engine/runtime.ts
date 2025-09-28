import type { RoomRuntime, GameMode } from './types';

export function createInitialRoomRuntime(mode: GameMode): RoomRuntime {
  return {
    running: true,
    mode,
    phase: 'idle',
    until: undefined,
    activePlayerId: null,
    scores: {},
    round: 1,
    superCells: new Map(),
    blitzCells: new Map(),
    cellAssignments: new Map(),
    usedCells: new Set(),
  };
}

import type { RoomRuntime } from './types';

export function createInitialRoomRuntime(): RoomRuntime {
  return {
    running: true,
    phase: 'idle',
    until: undefined,
    activePlayerId: null,
    scores: {},
    round: 1,
    superCells: new Map(),
    blitzCells: new Map(),
    cellAssignments: new Map(),
  };
}

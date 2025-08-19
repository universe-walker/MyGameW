import { create } from 'zustand';

type Player = { id: number; name: string; bot?: boolean };
type Phase = 'idle' | 'prepare' | 'buzzer_window' | 'answer_wait' | 'score_apply' | 'round_end' | 'final';

type State = {
  roomId: string | null;
  solo: boolean;
  players: Player[];
  phase: Phase;
  until?: number;
  activePlayerId?: number | null;
  botStatuses: Record<number, string>;
  setRoom: (id: string, players: Player[], solo?: boolean) => void;
  setPhase: (phase: Phase, until?: number, activePlayerId?: number | null) => void;
  setBotStatus: (playerId: number, status: string) => void;
  leaveRoom: () => void;
};

export const useGameStore = create<State>((set) => ({
  roomId: null,
  solo: false,
  players: [],
  phase: 'idle',
  until: undefined,
  activePlayerId: null,
  botStatuses: {},
  setRoom: (id, players, solo = false) => set({ roomId: id, players, solo }),
  setPhase: (phase, until, activePlayerId) => set({ phase, until, activePlayerId }),
  setBotStatus: (playerId, status) => set((s) => ({ botStatuses: { ...s.botStatuses, [playerId]: status } })),
  leaveRoom: () =>
    set({ roomId: null, solo: false, players: [], phase: 'idle', until: undefined, activePlayerId: null, botStatuses: {} }),
}));



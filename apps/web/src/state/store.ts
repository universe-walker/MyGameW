import { create } from 'zustand';

type Player = { id: number; name: string; bot?: boolean };
type Phase = 'idle' | 'prepare' | 'buzzer_window' | 'answer_wait' | 'score_apply' | 'round_end' | 'final';
type BoardCategory = { title: string; values: number[] };
type CurrentQuestion = { category: string; value: number; prompt: string } | undefined;

type State = {
  roomId: string | null;
  solo: boolean;
  players: Player[];
  phase: Phase;
  until?: number;
  activePlayerId?: number | null;
  botStatuses: Record<number, string>;
  boardCategories: BoardCategory[];
  question?: CurrentQuestion;
  setRoom: (id: string, players: Player[], solo?: boolean) => void;
  setPhase: (phase: Phase, until?: number, activePlayerId?: number | null, question?: CurrentQuestion) => void;
  setBoard: (categories: BoardCategory[]) => void;
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
  boardCategories: [],
  question: undefined,
  setRoom: (id, players, solo = false) => set({ roomId: id, players, solo }),
  setPhase: (phase, until, activePlayerId, question) => set({ phase, until, activePlayerId, question }),
  setBoard: (categories) => set({ boardCategories: categories }),
  setBotStatus: (playerId, status) => set((s) => ({ botStatuses: { ...s.botStatuses, [playerId]: status } })),
  leaveRoom: () =>
    set({ roomId: null, solo: false, players: [], phase: 'idle', until: undefined, activePlayerId: null, botStatuses: {}, boardCategories: [], question: undefined }),
}));



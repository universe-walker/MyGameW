import { create } from 'zustand';

export type Player = { id: number; name: string; bot?: boolean };
export type Phase =
  | 'idle'
  | 'prepare'
  | 'buzzer_window'
  | 'answer_wait'
  | 'score_apply'
  | 'round_end'
  | 'final';
export type BoardCategory = { title: string; values: number[] };
export type CurrentQuestion = { category: string; value: number; prompt: string };

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
  scores: Record<number, number>;
  setRoom: (id: string, players: Player[], solo?: boolean) => void;
  setPhase: (
    phase: Phase,
    until?: number,
    activePlayerId?: number | null,
    question?: CurrentQuestion,
    scores?: Record<number, number>,
  ) => void;
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
  scores: {},
  setRoom: (id, players, solo = false) => set({ roomId: id, players, solo }),
  setPhase: (phase, until, activePlayerId, question, scores) =>
    set((s) => ({ phase, until, activePlayerId, question, scores: scores ?? s.scores })),
  setBoard: (categories) => set({ boardCategories: categories }),
  setBotStatus: (playerId, status) => set((s) => ({ botStatuses: { ...s.botStatuses, [playerId]: status } })),
  leaveRoom: () =>
    set({ roomId: null, solo: false, players: [], phase: 'idle', until: undefined, activePlayerId: null, botStatuses: {}, boardCategories: [], question: undefined, scores: {} }),
}));



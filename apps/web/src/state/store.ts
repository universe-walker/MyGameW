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
export type BoardCategory = { title: string; values: number[]; blitzValues?: number[] };
export type CurrentQuestion = { category: string; value: number; prompt: string; options?: string[] };

type State = {
  roomId: string | null;
  solo: boolean;
  players: Player[];
  phase: Phase;
  mode?: 'normal' | 'blitz';
  blitzIndex?: number; // 1-based
  blitzTotal?: number;
  until?: number;
  activePlayerId?: number | null;
  botStatuses: Record<number, string>;
  boardCategories: BoardCategory[];
  question?: CurrentQuestion;
  scores: Record<string, number>;
  revealAnswer: string | null;
  // current word mask for placeholders
  answerMask: string | null;
  answerLen: number;
  nearMissAt: number | null;
  // Hint UI state
  canRevealHint: boolean;
  hintErrorMsg: string | null;
  hintErrorAt: number | null;
  // Pause state (client-side augmentation for solo mode)
  paused: boolean;
  pauseOffsetMs: number; // accumulated paused duration for current phase
  pauseStartedAt: number | null; // when current pause began
  setRoom: (id: string, players: Player[], solo?: boolean) => void;
  setPhase: (
    phase: Phase,
    until?: number,
    activePlayerId?: number | null,
    question?: CurrentQuestion,
    scores?: Record<string, number>,
    extras?: { mode?: 'normal' | 'blitz'; blitz?: { index: number; total: number } },
  ) => void;
  setBoard: (categories: BoardCategory[]) => void;
  setBotStatus: (playerId: number, status: string) => void;
  setRevealAnswer: (text: string | null) => void;
  setAnswerMask: (mask: string | null, len?: number) => void;
  setCanRevealHint: (v: boolean) => void;
  setHintError: (msg: string | null) => void;
  setNearMiss: () => void;
  setPaused: (paused: boolean) => void;
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
  revealAnswer: null,
  answerMask: null,
  answerLen: 0,
  nearMissAt: null,
  canRevealHint: false,
  hintErrorMsg: null,
  hintErrorAt: null,
  paused: false,
  pauseOffsetMs: 0,
  pauseStartedAt: null,
  setRoom: (id, players, solo = false) => set({ roomId: id, players, solo }),
  setPhase: (phase, until, activePlayerId, question, scores, extras) =>
    set((s) => ({
      phase,
      until,
      activePlayerId,
      question,
      scores: scores ?? s.scores,
      mode: extras?.mode,
      blitzIndex: extras?.blitz?.index,
      blitzTotal: extras?.blitz?.total,
      // Reset pause bookkeeping on every new phase payload
      paused: false,
      pauseOffsetMs: 0,
      pauseStartedAt: null,
    })),
  setBoard: (categories) => set({ boardCategories: categories }),
  setBotStatus: (playerId, status) => set((s) => ({ botStatuses: { ...s.botStatuses, [playerId]: status } })),
  setRevealAnswer: (text) => set({ revealAnswer: text }),
  setAnswerMask: (mask, len) =>
    set((s) => ({ answerMask: mask, answerLen: typeof len === 'number' ? len : s.answerLen })),
  setCanRevealHint: (v) => set({ canRevealHint: v }),
  setHintError: (msg) => set({ hintErrorMsg: msg, hintErrorAt: msg ? Date.now() : null }),
  setNearMiss: () => set({ nearMissAt: Date.now() }),
  setPaused: (paused) =>
    set((s) => {
      if (paused) {
        if (s.paused) return s;
        return { paused: true, pauseStartedAt: Date.now() } as Partial<State> as State;
      }
      if (!s.paused) return s;
      const now = Date.now();
      const delta = s.pauseStartedAt ? Math.max(0, now - s.pauseStartedAt) : 0;
      return { paused: false, pauseStartedAt: null, pauseOffsetMs: s.pauseOffsetMs + delta } as Partial<State> as State;
    }),
  leaveRoom: () =>
    set({ roomId: null, solo: false, players: [], phase: 'idle', until: undefined, activePlayerId: null, botStatuses: {}, boardCategories: [], question: undefined, scores: {}, revealAnswer: null, answerMask: null, answerLen: 0, nearMissAt: null, canRevealHint: false, hintErrorMsg: null, hintErrorAt: null, paused: false, pauseOffsetMs: 0, pauseStartedAt: null }),
}));



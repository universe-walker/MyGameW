import { create } from 'zustand';
export const useGameStore = create((set) => ({
    roomId: null,
    solo: false,
    players: [],
    phase: 'idle',
    until: undefined,
    botStatuses: {},
    setRoom: (id, players, solo = false) => set({ roomId: id, players, solo }),
    setPhase: (phase, until) => set({ phase, until }),
    setBotStatus: (playerId, status) => set((s) => ({ botStatuses: { ...s.botStatuses, [playerId]: status } })),
}));

import { create } from 'zustand';
export const useGameStore = create((set) => ({
    roomId: null,
    players: [],
    setRoom: (id, players) => set({ roomId: id, players }),
}));

import { create } from 'zustand';

type Player = { id: number; name: string };

type State = {
  roomId: string | null;
  players: Player[];
  setRoom: (id: string, players: Player[]) => void;
};

export const useGameStore = create<State>((set) => ({
  roomId: null,
  players: [],
  setRoom: (id, players) => set({ roomId: id, players }),
}));



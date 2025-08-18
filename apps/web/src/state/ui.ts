import { create } from 'zustand';

export type UiHomeState = {
  selectedTab: 'home' | 'achievements' | 'shop';
  pending: boolean;
  shopOpen: boolean;
  achievementsOpen: boolean;
  setPending: (v: boolean) => void;
  openShop: () => void;
  closeShop: () => void;
  openAchievements: () => void;
  closeAchievements: () => void;
};

export const useUiHome = create<UiHomeState>((set) => ({
  selectedTab: 'home',
  pending: false,
  shopOpen: false,
  achievementsOpen: false,
  setPending: (v) => set({ pending: v }),
  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
  openAchievements: () => set({ achievementsOpen: true }),
  closeAchievements: () => set({ achievementsOpen: false }),
}));

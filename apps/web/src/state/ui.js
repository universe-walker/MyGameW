import { create } from 'zustand';
export const useUiHome = create((set) => ({
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

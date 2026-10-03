import { create } from 'zustand';
import type { LiveData } from '../protocol';

interface LiveState {
  live: Record<string, LiveData>;
  setLive: (eid: string, data: LiveData) => void;
  clearLive: () => void;
}

export const useLiveStore = create<LiveState>()((set) => ({
  live: {},
  setLive: (eid, data) => set((s) => ({ live: { ...s.live, [eid]: data } })),
  clearLive: () => set({ live: {} }),
}));

import { create } from 'zustand';
import type { Screen } from '../types';

type Status = 'idle' | 'loading' | 'ok' | 'error';

interface ScreensState {
  status: Status;
  list: Screen[];
  error: string | null;
  retryCount: number;
  setLoading: () => void;
  setScreens: (list: Screen[]) => void;
  setError: (error: string) => void;
  retry: () => void;
}

export const useScreensStore = create<ScreensState>()((set) => ({
  status: 'idle',
  list: [],
  error: null,
  retryCount: 0,
  setLoading: () => set({ status: 'loading', error: null }),
  setScreens: (list) => set({ status: 'ok', list }),
  setError: (error) => set({ status: 'error', error }),
  retry: () => set((s) => ({ retryCount: s.retryCount + 1, status: 'loading', error: null })),
}));

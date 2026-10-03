import { create } from 'zustand';
import type { RectLike } from '../protocol';

interface RectsState {
  rects: Record<string, Record<string, RectLike>>;
  setRect: (screenId: string, eid: string, rect: RectLike) => void;
  clearScreenRects: (screenId: string) => void;
}

export const useRectsStore = create<RectsState>()((set) => ({
  rects: {},
  setRect: (screenId, eid, rect) =>
    set((s) => ({
      rects: {
        ...s.rects,
        [screenId]: { ...(s.rects[screenId] ?? {}), [eid]: rect },
      },
    })),
  clearScreenRects: (screenId) =>
    set((s) => {
      const next = { ...s.rects };
      delete next[screenId];
      return { rects: next };
    }),
}));

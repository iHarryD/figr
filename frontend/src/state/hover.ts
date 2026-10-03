import { create } from 'zustand';
import type { RectLike } from '../protocol';

export interface HoverTarget {
  screenId: string;
  eid: string;
  name?: string;
  rect?: RectLike;
}

interface HoverState {
  hover: HoverTarget | null;
  setHover: (target: HoverTarget | null) => void;
}

export const useHoverStore = create<HoverState>()((set) => ({
  hover: null,
  setHover: (hover) => set({ hover }),
}));

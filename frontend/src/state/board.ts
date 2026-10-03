import { create } from 'zustand';
import type { Mode } from '../types';

interface BoardState {
  pan: { x: number; y: number };
  zoom: number;
  mode: Mode;
  setPan: (pan: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
  setMode: (mode: Mode) => void;
}

export const useBoardStore = create<BoardState>()((set) => ({
  pan: { x: 0, y: 0 },
  zoom: 1,
  mode: 'select',
  setPan: (pan) => set({ pan }),
  setZoom: (zoom) => set({ zoom }),
  setMode: (mode) => set({ mode }),
}));

import { create } from 'zustand';

const _contentWindows = new Map<string, Window>();

export const setContentWindow = (screenId: string, win: Window): void => {
  _contentWindows.set(screenId, win);
};

export const getContentWindow = (screenId: string): Window | null =>
  _contentWindows.get(screenId) ?? null;

type PreviewStatus = 'loading' | 'ready' | 'error';

interface PreviewEntry {
  status: PreviewStatus;
  error: string | null;
  currentUrl: string;
  agentReady: boolean;
  pageError: string | null;
}

interface PreviewsState {
  previews: Record<string, PreviewEntry>;
  setPreview: (screenId: string, entry: Partial<PreviewEntry>) => void;
  initPreview: (screenId: string, url: string) => void;
}

export const usePreviewsStore = create<PreviewsState>()((set) => ({
  previews: {},
  initPreview: (screenId, url) =>
    set((s) => ({
      previews: {
        ...s.previews,
        [screenId]: { status: 'loading', error: null, currentUrl: url, agentReady: false, pageError: null },
      },
    })),
  setPreview: (screenId, entry) =>
    set((s) => ({
      previews: {
        ...s.previews,
        [screenId]: { ...s.previews[screenId], ...entry },
      },
    })),
}));

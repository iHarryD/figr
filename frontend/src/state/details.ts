import { create } from 'zustand';
import type { ElementDetails } from '../types';

type DetailStatus = 'idle' | 'loading' | 'ok' | 'no-details' | 'error';

interface DetailEntry {
  status: DetailStatus;
  data: ElementDetails | null;
  error: string | null;
  requestId: number;
}

interface DetailsState {
  details: Record<string, DetailEntry>;
  setLoading: (key: string, requestId: number) => void;
  setData: (key: string, requestId: number, data: ElementDetails) => void;
  setNoDetails: (key: string, requestId: number) => void;
  setError: (key: string, requestId: number, error: string) => void;
}

export const useDetailsStore = create<DetailsState>()((set) => ({
  details: {},
  setLoading: (key, requestId) =>
    set((s) => ({
      details: {
        ...s.details,
        [key]: { status: 'loading', data: null, error: null, requestId },
      },
    })),
  setData: (key, requestId, data) =>
    set((s) => {
      if (s.details[key]?.requestId !== requestId) return s;
      return {
        details: { ...s.details, [key]: { status: 'ok', data, error: null, requestId } },
      };
    }),
  setNoDetails: (key, requestId) =>
    set((s) => {
      if (s.details[key]?.requestId !== requestId) return s;
      return {
        details: { ...s.details, [key]: { status: 'no-details', data: null, error: null, requestId } },
      };
    }),
  setError: (key, requestId, error) =>
    set((s) => {
      if (s.details[key]?.requestId !== requestId) return s;
      return {
        details: { ...s.details, [key]: { status: 'error', data: null, error, requestId } },
      };
    }),
}));

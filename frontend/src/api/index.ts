import type { Screen, ElementDetails } from '../types';
import { devFlags } from '../utilities/devFlags';

const API_BASE = 'http://localhost:4000';

export const fetchScreens = async (signal?: AbortSignal): Promise<Screen[]> => {
  if (devFlags.failScreens) throw new Error('[dev] /screens forced failure');
  const res = await fetch(`${API_BASE}/screens`, { signal });
  if (!res.ok) throw new Error(`/screens: ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('/screens: malformed response');
  return data as Screen[];
};

export type ElementResult =
  | { kind: 'ok'; data: ElementDetails }
  | { kind: 'no-details' };

export const fetchElement = async (
  key: string,
  signal?: AbortSignal,
): Promise<ElementResult> => {
  if (devFlags.failElements) throw new Error('[dev] /elements forced failure');
  const res = await fetch(`${API_BASE}/elements/${encodeURIComponent(key)}`, { signal });
  if (res.status === 404) return { kind: 'no-details' };
  if (!res.ok) throw new Error(`/elements/${key}: ${res.status}`);
  const data: unknown = await res.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('component' in data) ||
    typeof (data as Record<string, unknown>).component !== 'string'
  ) {
    throw new Error(`/elements/${key}: malformed response`);
  }
  return { kind: 'ok', data: data as ElementDetails };
};

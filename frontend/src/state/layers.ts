import { create } from 'zustand';

export interface LayerRow {
  eid: string;
  name: string;
  tag: string;
  hasChildren: boolean;
  childrenLoaded: boolean;
  childIds?: string[];
  parentEid: string | null;
  loading?: boolean;
  loadError?: string | null;
}

export interface SearchResult {
  eid: string;
  name: string;
  tag: string;
  ancestorChain: Array<{ eid: string; name: string }>;
}

interface LayersSlice {
  expanded: Set<string>;
  rowsById: Record<string, LayerRow>;
  rootIds: string[];
  scroll: number;
  search: string;
  searchResults: SearchResult[] | null;
  focusedEid: string | null;
  preSearchExpanded: Set<string> | null;
}

interface LayersState {
  layers: Record<string, LayersSlice>;
  initSlice: (screenId: string) => void;
  mergeChildren: (
    screenId: string,
    parentRowEid: string | null,
    rows: LayerRow[],
    childIds: string[],
  ) => void;
  setRowState: (screenId: string, eid: string, patch: Partial<LayerRow>) => void;
  setExpanded: (screenId: string, eid: string, expanded: boolean) => void;
  setFocusedEid: (screenId: string, eid: string | null) => void;
  setSearch: (screenId: string, query: string) => void;
  setSearchResults: (screenId: string, results: SearchResult[] | null) => void;
  setScroll: (screenId: string, scroll: number) => void;
  savePreSearchState: (screenId: string) => void;
  restorePreSearchState: (screenId: string) => void;
  clearSlice: (screenId: string) => void;
}

const emptySlice = (): LayersSlice => ({
  expanded: new Set(),
  rowsById: {},
  rootIds: [],
  scroll: 0,
  search: '',
  searchResults: null,
  focusedEid: null,
  preSearchExpanded: null,
});

export const useLayersStore = create<LayersState>()((set) => ({
  layers: {},

  initSlice: (screenId) =>
    set((s) => ({
      layers: { ...s.layers, [screenId]: s.layers[screenId] ?? emptySlice() },
    })),

  mergeChildren: (screenId, parentRowEid, rows, childIds) =>
    set((s) => {
      const slice = s.layers[screenId] ?? emptySlice();
      const rowsById = { ...slice.rowsById };
      for (const row of rows) {
        const existing = rowsById[row.eid];
        rowsById[row.eid] = existing
          ? { ...row, childIds: existing.childIds, childrenLoaded: existing.childrenLoaded }
          : row;
      }
      let rootIds = slice.rootIds;
      if (parentRowEid === null) {
        rootIds = childIds;
      } else {
        rowsById[parentRowEid] = {
          ...(rowsById[parentRowEid] ?? {}),
          childIds,
          childrenLoaded: true,
          loading: false,
          loadError: null,
        } as LayerRow;
      }
      return { layers: { ...s.layers, [screenId]: { ...slice, rowsById, rootIds } } };
    }),

  setRowState: (screenId, eid, patch) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice?.rowsById[eid]) return s;
      return {
        layers: {
          ...s.layers,
          [screenId]: {
            ...slice,
            rowsById: { ...slice.rowsById, [eid]: { ...slice.rowsById[eid], ...patch } },
          },
        },
      };
    }),

  setExpanded: (screenId, eid, expanded) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice) return s;
      const next = new Set(slice.expanded);
      expanded ? next.add(eid) : next.delete(eid);
      return { layers: { ...s.layers, [screenId]: { ...slice, expanded: next } } };
    }),

  setFocusedEid: (screenId, eid) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice) return s;
      return { layers: { ...s.layers, [screenId]: { ...slice, focusedEid: eid } } };
    }),

  setSearch: (screenId, query) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice) return s;
      return { layers: { ...s.layers, [screenId]: { ...slice, search: query } } };
    }),

  setSearchResults: (screenId, searchResults) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice) return s;
      return { layers: { ...s.layers, [screenId]: { ...slice, searchResults } } };
    }),

  setScroll: (screenId, scroll) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice) return s;
      return { layers: { ...s.layers, [screenId]: { ...slice, scroll } } };
    }),

  savePreSearchState: (screenId) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice || slice.preSearchExpanded !== null) return s;
      return {
        layers: {
          ...s.layers,
          [screenId]: { ...slice, preSearchExpanded: new Set(slice.expanded) },
        },
      };
    }),

  restorePreSearchState: (screenId) =>
    set((s) => {
      const slice = s.layers[screenId];
      if (!slice || slice.preSearchExpanded === null) return s;
      return {
        layers: {
          ...s.layers,
          [screenId]: { ...slice, expanded: new Set(slice.preSearchExpanded), preSearchExpanded: null },
        },
      };
    }),

  clearSlice: (screenId) =>
    set((s) => ({ layers: { ...s.layers, [screenId]: emptySlice() } })),
}));

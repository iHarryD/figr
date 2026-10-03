import { create } from 'zustand';

interface SelectionState {
  screenId: string | null;
  eids: string[];
  anchorEid: string | null;
  noLongerExists: boolean;
  set: (screenId: string, eids: string[], anchorEid: string) => void;
  toggle: (screenId: string, eid: string) => void;
  clear: (noLongerExists?: boolean) => void;
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  screenId: null,
  eids: [],
  anchorEid: null,
  noLongerExists: false,
  set: (screenId, eids, anchorEid) => set({ screenId, eids, anchorEid, noLongerExists: false }),
  toggle: (screenId, eid) => {
    const s = get();
    if (s.screenId !== screenId) {
      set({ screenId, eids: [eid], anchorEid: eid, noLongerExists: false });
      return;
    }
    const next = s.eids.includes(eid)
      ? s.eids.filter((e) => e !== eid)
      : [...s.eids, eid];
    set({ eids: next, anchorEid: eid, noLongerExists: false });
  },
  clear: (noLongerExists = false) => set({ screenId: null, eids: [], anchorEid: null, noLongerExists }),
}));

import { makeMsg } from '../protocol';
import { getContentWindow } from '../state/previews';
import { useLayersStore, type LayerRow } from '../state/layers';
import { sendRequest } from './pending';
import { report } from './report';

interface ChildInfo {
  eid: string;
  name: string;
  tag: string;
  hasChildren: boolean;
}

export const loadChildren = async (screenId: string, parentEid: string): Promise<void> => {
  const win = getContentWindow(screenId);
  if (!win) return;

  const parentRowEid = parentEid === 'body' ? null : parentEid;

  if (parentRowEid) {
    useLayersStore.getState().setRowState(screenId, parentRowEid, { loading: true, loadError: null });
  }

  try {
    const data = await sendRequest<{ children: ChildInfo[] }>(
      win,
      makeMsg('getChildren', { eid: parentEid }),
      3000,
    );

    const rows: LayerRow[] = data.children.map((c) => ({
      eid: c.eid,
      name: c.name,
      tag: c.tag,
      hasChildren: c.hasChildren,
      childrenLoaded: false,
      childIds: undefined,
      parentEid: parentRowEid,
    }));

    useLayersStore.getState().mergeChildren(
      screenId,
      parentRowEid,
      rows,
      data.children.map((c) => c.eid),
    );
  } catch (err) {
    if (parentRowEid) {
      useLayersStore
        .getState()
        .setRowState(screenId, parentRowEid, { loading: false, loadError: "Couldn't load" });
      report(err instanceof Error ? err : new Error(String(err)), { region: 'layers-row', screenId });
    }
  }
};

interface AncestorInfo {
  eid: string;
  name: string;
  tag: string;
  hasChildren: boolean;
}

export const expandToEid = async (screenId: string, targetEid: string): Promise<void> => {
  const win = getContentWindow(screenId);
  if (!win) return;

  const layer = () => useLayersStore.getState().layers[screenId];

  if (!layer()?.rootIds.length) {
    await loadChildren(screenId, 'body');
  }

  let result: { ancestors: AncestorInfo[] };
  try {
    result = await sendRequest<{ ancestors: AncestorInfo[] }>(
      win,
      makeMsg('getAncestors', { eid: targetEid }),
      3000,
    );
  } catch {
    return;
  }

  for (const ancestor of result.ancestors) {
    const l = layer();
    if (!l?.rowsById[ancestor.eid]) return;
    useLayersStore.getState().setExpanded(screenId, ancestor.eid, true);
    const row = l.rowsById[ancestor.eid];
    if (row?.hasChildren && !row.childrenLoaded) {
      await loadChildren(screenId, ancestor.eid);
    }
  }

  useLayersStore.getState().setFocusedEid(screenId, targetEid);
};

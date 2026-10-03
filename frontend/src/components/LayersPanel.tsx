import { useEffect, useRef, useState } from 'react';
import { makeMsg } from '../protocol';
import { useHoverStore, useLayersStore, usePreviewsStore, useScreensStore, useSelectionStore, type LayerRow, type SearchResult } from '../state';
import { getContentWindow } from '../state/previews';
import { cn, loadChildren, expandToEid, sendRequest } from '../utilities';

type VisibleRow = { row: LayerRow; depth: number; expanded: boolean };

const computeVisibleRows = (
  slice: ReturnType<typeof useLayersStore.getState>['layers'][string] | undefined,
): VisibleRow[] => {
  if (!slice) return [];
  const s = slice;
  const result: VisibleRow[] = [];
  const walk = (ids: string[], depth: number) => {
    for (const eid of ids) {
      const row = s.rowsById[eid];
      if (!row) continue;
      const expanded = s.expanded.has(eid);
      result.push({ row, depth, expanded });
      if (expanded && row.childIds?.length) walk(row.childIds, depth + 1);
    }
  };
  walk(s.rootIds, 0);
  return result;
};

const findNearestVisible = (eid: string, visible: Set<string>, rowsById: Record<string, LayerRow>): string | null => {
  let cur: string | null | undefined = rowsById[eid]?.parentEid;
  while (cur) {
    if (visible.has(cur)) return cur;
    cur = rowsById[cur]?.parentEid;
  }
  return null;
};

const runSearch = async (screenId: string, query: string) => {
  const win = getContentWindow(screenId);
  if (!win) return;
  if (!query.trim()) {
    useLayersStore.getState().restorePreSearchState(screenId);
    useLayersStore.getState().setSearchResults(screenId, null);
    return;
  }
  useLayersStore.getState().savePreSearchState(screenId);
  try {
    const data = await sendRequest<{ results: SearchResult[] }>(
      win,
      makeMsg('search', { query }),
      5000,
    );
    useLayersStore.getState().setSearchResults(screenId, data.results);
  } catch {
    useLayersStore.getState().setSearchResults(screenId, null);
  }
};

interface RowProps {
  row: LayerRow;
  depth: number;
  expanded: boolean;
  isHoverTarget: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onRetry?: () => void;
}

const Row = ({ row, depth, expanded, isHoverTarget, isSelected, onToggle, onClick, onHoverEnter, onHoverLeave, onRetry }: RowProps) => {
  const isLoadingPlaceholder = row.eid.endsWith('__loading');
  return (
    <div
      data-eid={row.eid}
      className={cn(
        'flex h-6 items-center gap-1 truncate pr-2 text-xs cursor-pointer select-none',
        isSelected
          ? 'bg-outline-selected/20 text-panel-text'
          : isHoverTarget
          ? 'bg-white/5 text-panel-text'
          : 'text-panel-muted hover:bg-white/5 hover:text-panel-text',
      )}
      style={{ paddingLeft: depth * 14 + 6 }}
      onClick={isLoadingPlaceholder ? undefined : onClick}
      onMouseEnter={isLoadingPlaceholder ? undefined : onHoverEnter}
      onMouseLeave={isLoadingPlaceholder ? undefined : onHoverLeave}
    >
      <span
        className="flex h-4 w-4 flex-none items-center justify-center text-panel-muted"
        onClick={
          row.hasChildren && !row.loadError
            ? (e) => { e.stopPropagation(); onToggle(); }
            : undefined
        }
      >
        {row.loading ? (
          <span className="opacity-40">…</span>
        ) : row.hasChildren && !row.loadError ? (
          <span className="text-[9px]">{expanded ? '▼' : '▶'}</span>
        ) : null}
      </span>

      {isLoadingPlaceholder ? (
        <span className="opacity-30 italic">Loading…</span>
      ) : (
        <>
          <span className="font-mono">{row.tag || row.name}</span>
          {row.name !== row.tag && row.name !== row.tag.toLowerCase() && (
            <span className="ml-1 truncate text-[10px] opacity-50">{row.name}</span>
          )}
          {row.loadError && (
            <span
              className="ml-auto cursor-pointer text-[10px] text-red-400 opacity-80 hover:opacity-100"
              title="Retry"
              onClick={(e) => { e.stopPropagation(); onRetry?.(); }}
            >
              ↺
            </span>
          )}
        </>
      )}
    </div>
  );
};

const SearchRow = ({
  result,
  isSelected,
  onClick,
}: {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
}) => {
  const breadcrumb = result.ancestorChain.map((a) => a.name).join(' › ');
  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-xs hover:bg-white/5',
        isSelected && 'bg-outline-selected/20',
      )}
      onClick={onClick}
    >
      {breadcrumb && (
        <span className="truncate text-[10px] text-panel-muted opacity-60">{breadcrumb}</span>
      )}
      <span className="font-mono text-panel-text">{result.tag}</span>
    </div>
  );
};

export const LayersPanel = () => {
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selScreenId = useSelectionStore((s) => s.screenId);
  const anchorEid = useSelectionStore((s) => s.anchorEid);
  const selEids = useSelectionStore((s) => s.eids);
  const screens = useScreensStore((s) => s.list);
  const hover = useHoverStore((s) => s.hover);
  const setHover = useHoverStore((s) => s.setHover);

  useEffect(() => {
    if (selScreenId) setActiveScreenId(selScreenId);
  }, [selScreenId]);

  const agentReady = usePreviewsStore((s) =>
    activeScreenId ? (s.previews[activeScreenId]?.agentReady ?? false) : false,
  );

  useEffect(() => {
    if (!activeScreenId || !agentReady) return;
    useLayersStore.getState().initSlice(activeScreenId);
    const l = useLayersStore.getState().layers[activeScreenId];
    if (!l?.rootIds.length) {
      loadChildren(activeScreenId, 'body').catch(() => {});
    }
  }, [activeScreenId, agentReady]);

  useEffect(() => {
    if (!activeScreenId || !anchorEid || selScreenId !== activeScreenId) return;
    expandToEid(activeScreenId, anchorEid).catch(() => {});
  }, [anchorEid, activeScreenId, selScreenId]);

  const focusedEid = useLayersStore((s) =>
    activeScreenId ? (s.layers[activeScreenId]?.focusedEid ?? null) : null,
  );
  useEffect(() => {
    if (!focusedEid || !listRef.current || !activeScreenId) return;
    const el = Array.from(listRef.current.querySelectorAll('[data-eid]')).find(
      (n) => n.getAttribute('data-eid') === focusedEid,
    );
    el?.scrollIntoView({ block: 'nearest' });
    useLayersStore.getState().setFocusedEid(activeScreenId, null);
  }, [focusedEid, activeScreenId]);

  useEffect(() => {
    if (!activeScreenId || !listRef.current) return;
    const savedScroll = useLayersStore.getState().layers[activeScreenId]?.scroll ?? 0;
    listRef.current.scrollTop = savedScroll;
  }, [activeScreenId]);

  useEffect(() => {
    if (!activeScreenId) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      runSearch(activeScreenId, searchQuery).catch(() => {});
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, activeScreenId]);

  const layer = useLayersStore((s) => (activeScreenId ? s.layers[activeScreenId] : undefined));
  const visibleRows = computeVisibleRows(layer);
  const visibleSet = new Set(visibleRows.map((r) => r.row.eid));

  const activeScreen = screens.find((s) => s.id === activeScreenId);

  const hoverEid =
    hover?.screenId === activeScreenId
      ? (visibleSet.has(hover.eid) ? hover.eid : findNearestVisible(hover.eid, visibleSet, layer?.rowsById ?? {}))
      : null;

  const handleRowClick = (row: LayerRow) => {
    if (!activeScreenId) return;
    useSelectionStore.getState().set(activeScreenId, [row.eid], row.eid);
    const win = getContentWindow(activeScreenId);
    if (win) win.postMessage(makeMsg('scrollIntoView', { eid: row.eid }), '*');
  };

  const handleRowToggle = (row: LayerRow) => {
    if (!activeScreenId) return;
    const isExpanded = layer?.expanded.has(row.eid) ?? false;
    if (!isExpanded && row.hasChildren && !row.childrenLoaded && !row.loading) {
      useLayersStore.getState().setExpanded(activeScreenId, row.eid, true);
      loadChildren(activeScreenId, row.eid).catch(() => {});
    } else {
      useLayersStore.getState().setExpanded(activeScreenId, row.eid, !isExpanded);
    }
  };

  const handleRowHoverEnter = (row: LayerRow) => {
    if (!activeScreenId) return;
    setHover({ screenId: activeScreenId, eid: row.eid });
  };

  const handleRowHoverLeave = (row: LayerRow) => {
    const current = useHoverStore.getState().hover;
    if (current?.eid === row.eid && current?.screenId === activeScreenId) setHover(null);
  };

  const handleSearchResultClick = (result: SearchResult) => {
    if (!activeScreenId) return;
    useSelectionStore.getState().set(activeScreenId, [result.eid], result.eid);
    const win = getContentWindow(activeScreenId);
    if (win) win.postMessage(makeMsg('scrollIntoView', { eid: result.eid }), '*');
  };

  const handleScroll = () => {
    if (listRef.current && activeScreenId) {
      useLayersStore.getState().setScroll(activeScreenId, listRef.current.scrollTop);
    }
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (!activeScreenId || !layer) return;
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrowKeys.includes(e.key)) return;
    e.preventDefault();

    const currentEid = selScreenId === activeScreenId ? (anchorEid ?? selEids[0]) : null;
    const currentIdx = currentEid ? visibleRows.findIndex((r) => r.row.eid === currentEid) : -1;

    if (e.key === 'ArrowUp') {
      if (currentIdx < 0) {
        if (visibleRows.length > 0) handleRowClick(visibleRows[visibleRows.length - 1].row);
      } else if (currentIdx > 0) {
        handleRowClick(visibleRows[currentIdx - 1].row);
      }
    } else if (e.key === 'ArrowDown') {
      if (currentIdx < 0) {
        if (visibleRows.length > 0) handleRowClick(visibleRows[0].row);
      } else if (currentIdx < visibleRows.length - 1) {
        handleRowClick(visibleRows[currentIdx + 1].row);
      }
    } else if (e.key === 'ArrowRight') {
      if (currentIdx < 0) return;
      const { row, expanded } = visibleRows[currentIdx];
      if (row.hasChildren && !expanded) {
        handleRowToggle(row);
      } else if (row.hasChildren && expanded && row.childIds?.length) {
        const firstChild = layer.rowsById[row.childIds[0]];
        if (firstChild) handleRowClick(firstChild);
      }
    } else if (e.key === 'ArrowLeft') {
      if (currentIdx < 0) return;
      const { row, expanded } = visibleRows[currentIdx];
      if (row.hasChildren && expanded) {
        useLayersStore.getState().setExpanded(activeScreenId, row.eid, false);
      } else if (row.parentEid) {
        const parent = layer.rowsById[row.parentEid];
        if (parent) handleRowClick(parent);
      }
    }
  };

  const isSearchActive = layer?.searchResults !== null && layer?.searchResults !== undefined;

  return (
    <aside
      className="flex h-full w-60 flex-none flex-col border-r border-panel-border bg-panel-bg outline-none"
      tabIndex={0}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="flex h-9 flex-none items-center gap-2 border-b border-panel-border px-3">
        <span className="flex-1 truncate text-xs font-medium text-panel-muted">
          {activeScreen?.name ?? 'Layers'}
        </span>
      </div>

      <div className="flex-none border-b border-panel-border px-2 py-1.5">
        <input
          type="text"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded bg-panel-border px-2 py-1 text-xs text-panel-text placeholder-panel-muted outline-none focus:ring-1 focus:ring-outline-hover"
        />
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {!activeScreenId ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-panel-muted">Click something in a preview</span>
          </div>
        ) : isSearchActive ? (
          layer!.searchResults!.length === 0 ? (
            <div className="flex h-20 items-center justify-center">
              <span className="text-xs text-panel-muted">No results</span>
            </div>
          ) : (
            layer!.searchResults!.map((result) => (
              <SearchRow
                key={result.eid}
                result={result}
                isSelected={selEids.includes(result.eid) && selScreenId === activeScreenId}
                onClick={() => handleSearchResultClick(result)}
              />
            ))
          )
        ) : visibleRows.length === 0 ? (
          <div className="flex h-20 items-center justify-center">
            <span className="text-xs text-panel-muted">Loading…</span>
          </div>
        ) : (
          visibleRows.map(({ row, depth, expanded }) => (
            <Row
              key={row.eid}
              row={row}
              depth={depth}
              expanded={expanded}
              isHoverTarget={hoverEid === row.eid}
              isSelected={selEids.includes(row.eid) && selScreenId === activeScreenId}
              onToggle={() => handleRowToggle(row)}
              onClick={() => handleRowClick(row)}
              onHoverEnter={() => handleRowHoverEnter(row)}
              onHoverLeave={() => handleRowHoverLeave(row)}
              onRetry={row.loadError ? () => {
                if (!activeScreenId) return;
                loadChildren(activeScreenId, row.eid).catch(() => {});
              } : undefined}
            />
          ))
        )}
      </div>
    </aside>
  );
};

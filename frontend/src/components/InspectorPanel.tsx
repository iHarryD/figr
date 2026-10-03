import { useEffect, useRef, useState } from 'react';
import { makeMsg } from '../protocol';
import type { LiveData } from '../protocol';
import { fetchElement } from '../api';
import { getContentWindow, useDetailsStore, useLiveStore, useSelectionStore } from '../state';
import { cn, devFlags, report } from '../utilities';

const merge = (data: LiveData[], key: keyof LiveData): string => {
  if (data.length === 0) return '—';
  const vals = data.map((d) => String(d[key]));
  const first = vals[0];
  return vals.every((v) => v === first) ? first : 'Mixed';
};

const isColorValue = (v: string) =>
  v.startsWith('rgb') || v.startsWith('#') || v.startsWith('hsl');

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-2 py-0.5">
    <span className="w-12 flex-none text-[10px] text-panel-muted">{label}</span>
    <span className="min-w-0 flex-1 truncate text-[11px] text-panel-text">
      {isColorValue(value) ? (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 flex-none rounded-sm border border-white/20"
            style={{ background: value }}
          />
          {value}
        </span>
      ) : (
        value
      )}
    </span>
  </div>
);

export const InspectorPanel = () => {
  const selScreenId = useSelectionStore((s) => s.screenId);
  const selEids = useSelectionStore((s) => s.eids);
  const noLongerExists = useSelectionStore((s) => s.noLongerExists);
  const live = useLiveStore((s) => s.live);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const eiasKey = selEids.join(',');

  useEffect(() => {
    useLiveStore.getState().clearLive();
    if (!selScreenId || selEids.length === 0) return;
    const win = getContentWindow(selScreenId);
    if (!win) return;
    win.postMessage(makeMsg('getLive', { eids: selEids }), '*');
    return () => {
      const w = getContentWindow(selScreenId);
      if (w) w.postMessage(makeMsg('getLive', { eids: [] }), '*');
    };
  }, [selScreenId, eiasKey]);

  const isSingle = selEids.length === 1;
  const anchorEid = isSingle ? selEids[0] : null;
  const detailKey = anchorEid?.startsWith('key:') ? anchorEid.slice(4) : null;
  const detailEntry = useDetailsStore((s) => (detailKey ? (s.details[detailKey] ?? null) : null));

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!detailKey) return;
    const reqId = ++requestIdRef.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    useDetailsStore.getState().setLoading(detailKey, reqId);
    fetchElement(detailKey, ctrl.signal)
      .then((result) => {
        if (result.kind === 'ok') {
          useDetailsStore.getState().setData(detailKey, reqId, result.data);
        } else {
          useDetailsStore.getState().setNoDetails(detailKey, reqId);
        }
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        useDetailsStore.getState().setError(detailKey, reqId, err.message ?? 'Failed');
        report(err, { region: 'details', screenId: selScreenId, elementKey: detailKey ?? undefined });
      });
    return () => ctrl.abort();
  }, [detailKey, retryCount]);

  if (devFlags.throwInspector) throw new Error('[dev] inspector render throw');

  const liveData = selEids.map((e) => live[e]).filter((d): d is LiveData => !!d);
  const hasLive = liveData.length > 0;
  const firstLive = liveData[0] as LiveData | undefined;
  const isEmpty = !selScreenId || selEids.length === 0;

  return (
    <aside className="flex h-full w-60 flex-none flex-col border-l border-panel-border bg-panel-bg">
      <div className="flex h-9 flex-none items-center border-b border-panel-border px-3">
        <span className="flex-1 truncate text-xs font-medium text-panel-muted">
          {selEids.length > 1
            ? `${selEids.length} elements`
            : firstLive
            ? `${firstLive.tag}${firstLive.name && firstLive.name !== firstLive.tag ? ' · ' + firstLive.name : ''}`
            : 'Inspector'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-panel-muted">
              {noLongerExists ? 'This element no longer exists' : 'Select an element'}
            </span>
          </div>
        ) : (
          <div className="space-y-5 px-3 py-3">
            <section>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-panel-muted/70">
                Live
              </div>
              {!hasLive ? (
                <div className="text-[11px] text-panel-muted">Loading…</div>
              ) : (
                <div>
                  <Field label="Size" value={`${merge(liveData, 'w')} × ${merge(liveData, 'h')}`} />
                  <Field label="Pos" value={`${merge(liveData, 'x')}, ${merge(liveData, 'y')}`} />
                  <Field label="Color" value={merge(liveData, 'color')} />
                  <Field label="BG" value={merge(liveData, 'bg')} />
                  <Field label="Family" value={merge(liveData, 'fontFamily')} />
                  <Field
                    label="Font"
                    value={`${merge(liveData, 'fontSize')} / ${merge(liveData, 'fontWeight')}`}
                  />
                  {isSingle && firstLive && firstLive.id && (
                    <Field label="ID" value={firstLive.id} />
                  )}
                  {isSingle && firstLive && firstLive.classes && (
                    <Field label="Classes" value={firstLive.classes} />
                  )}
                  {isSingle && firstLive && firstLive.text && (
                    <Field
                      label="Text"
                      value={firstLive.text.length > 120 ? firstLive.text.slice(0, 120) + '…' : firstLive.text}
                    />
                  )}
                </div>
              )}
            </section>

            {isSingle && (
              <section>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-panel-muted/70">
                  Details
                </div>
                {!detailKey ? (
                  <div className="text-[11px] text-panel-muted">No details</div>
                ) : !detailEntry || detailEntry.status === 'loading' ? (
                  <div className="space-y-2">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-panel-border" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-panel-border" />
                    <div className="h-3 w-full animate-pulse rounded bg-panel-border" />
                  </div>
                ) : detailEntry.status === 'ok' && detailEntry.data ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-panel-text">
                        {detailEntry.data.component}
                      </span>
                      <span
                        className={cn(
                          'rounded px-1 py-0.5 text-[9px] font-semibold uppercase',
                          detailEntry.data.status === 'stable' && 'bg-green-900/50 text-green-400',
                          detailEntry.data.status === 'beta' && 'bg-yellow-900/50 text-yellow-400',
                          detailEntry.data.status === 'deprecated' && 'bg-red-900/50 text-red-400',
                        )}
                      >
                        {detailEntry.data.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-panel-muted">{detailEntry.data.owner}</div>
                    {detailEntry.data.description && (
                      <div className="mt-1 text-[11px] leading-relaxed text-panel-text/70">
                        {detailEntry.data.description}
                      </div>
                    )}
                  </div>
                ) : detailEntry.status === 'no-details' ? (
                  <div className="text-[11px] text-panel-muted">No details for this element</div>
                ) : detailEntry.status === 'error' ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-red-400">{detailEntry.error}</div>
                    <button
                      className="rounded bg-panel-border px-2 py-1 text-[11px] text-panel-text hover:bg-white/10"
                      onClick={() => setRetryCount((c) => c + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

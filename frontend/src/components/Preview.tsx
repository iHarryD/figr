import { useEffect, useLayoutEffect, useRef } from 'react';
import { makeMsg, type AgentMessage } from '../protocol';
import { useBoardStore, useHoverStore, useLayersStore, usePreviewsStore, useRectsStore, useSelectionStore, setContentWindow } from '../state';
import { resolvePending, rejectPending, loadChildren, report } from '../utilities';
import { useLiveStore } from '../state/live';
import { Overlay } from './Overlay';
import type { Screen } from '../types';

interface PreviewProps {
  screen: Screen;
  onAgentWheel: (vpX: number, vpY: number, deltaY: number) => void;
}

export const Preview = ({ screen, onAgentWheel }: PreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWheelRef = useRef(onAgentWheel);

  useEffect(() => {
    onWheelRef.current = onAgentWheel;
  }, [onAgentWheel]);

  const initPreview = usePreviewsStore((s) => s.initPreview);
  const setPreview = usePreviewsStore((s) => s.setPreview);
  const preview = usePreviewsStore((s) => s.previews[screen.id]);
  const mode = useBoardStore((s) => s.mode);
  const isAgentReady = preview?.agentReady ?? false;

  useLayoutEffect(() => {
    initPreview(screen.id, screen.url);
  }, [screen.id, screen.url, initPreview]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    if (!usePreviewsStore.getState().previews[screen.id]?.agentReady) return;
    iframe.contentWindow.postMessage(makeMsg('setMode', { mode }), '*');
  }, [mode, screen.id]);

  const selScreenId = useSelectionStore((s) => s.screenId);
  const selEids = useSelectionStore((s) => s.eids);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !isAgentReady) return;
    const eids = selScreenId === screen.id ? selEids : [];
    iframe.contentWindow.postMessage(makeMsg('subscribeRects', { eids }), '*');
    if (selScreenId !== screen.id) {
      useRectsStore.getState().clearScreenRects(screen.id);
    }
  }, [selScreenId, selEids, screen.id, isAgentReady]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return;

      const msg = event.data as AgentMessage;
      if (!msg || (msg as { v?: unknown }).v !== 1) return;

      if (msg.kind === 'ready') {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setPreview(screen.id, { agentReady: true, status: 'ready' });
        setContentWindow(screen.id, iframe.contentWindow!);
        iframe.contentWindow!.postMessage(
          makeMsg('setMode', { mode: useBoardStore.getState().mode }),
          '*',
        );
      }

      if (msg.kind === 'wheel') {
        const rect = iframeRef.current?.getBoundingClientRect();
        if (!rect) return;
        onWheelRef.current(
          rect.left + msg.payload.clientX,
          rect.top + msg.payload.clientY,
          msg.payload.deltaY,
        );
      }

      if (msg.kind === 'pointer') {
        const { setHover } = useHoverStore.getState();
        if (msg.payload.eid && msg.payload.rect) {
          setHover({ screenId: screen.id, eid: msg.payload.eid, name: msg.payload.name ?? undefined, rect: msg.payload.rect });
        } else {
          const current = useHoverStore.getState().hover;
          if (current?.screenId === screen.id) setHover(null);
        }
      }

      if (msg.kind === 'click') {
        const sel = useSelectionStore.getState();
        if (!msg.payload.eid) {
          sel.clear();
          return;
        }
        if (msg.payload.shift && sel.screenId === screen.id) {
          sel.toggle(screen.id, msg.payload.eid);
        } else {
          sel.set(screen.id, [msg.payload.eid], msg.payload.eid);
        }
      }

      if (msg.kind === 'rects') {
        const { setRect } = useRectsStore.getState();
        msg.payload.updates.forEach(({ eid, rect }) => setRect(screen.id, eid, rect));
      }

      if (msg.kind === 'mutation') {
        const { parentEid } = msg.payload;
        const l = useLayersStore.getState().layers[screen.id];
        if (l) {
          const isRoot = parentEid === 'body';
          const row = isRoot ? null : l.rowsById[parentEid];
          if (isRoot && l.rootIds.length > 0) {
            loadChildren(screen.id, 'body').catch(() => {});
          } else if (row?.childrenLoaded) {
            loadChildren(screen.id, parentEid).catch(() => {});
          }
        }
      }

      if (msg.kind === 'eidRemap') {
        const sel = useSelectionStore.getState();

        if (msg.payload.remaps.length > 0 && sel.screenId === screen.id) {
          let eids = [...sel.eids];
          let anchor = sel.anchorEid;
          msg.payload.remaps.forEach(({ old: oldEid, new: newEid }) => {
            eids = eids.map((e) => (e === oldEid ? newEid : e));
            if (anchor === oldEid) anchor = newEid;
          });
          sel.set(screen.id, eids, anchor ?? eids[0]);
        }

        if (msg.payload.removed.length > 0 && sel.screenId === screen.id) {
          const removedSet = new Set(msg.payload.removed);
          const surviving = sel.eids.filter((e) => !removedSet.has(e));
          if (surviving.length === 0) {
            sel.clear(true);
          } else if (surviving.length !== sel.eids.length) {
            const anchor = removedSet.has(sel.anchorEid ?? '') ? surviving[0] : sel.anchorEid;
            sel.set(screen.id, surviving, anchor ?? surviving[0]);
          }
        }
      }

      if (msg.kind === 'live') {
        useLiveStore.getState().setLive(msg.payload.eid, msg.payload);
      }

      if (msg.kind === 'navigated') {
        const sel = useSelectionStore.getState();
        if (sel.screenId === screen.id) {
          sel.clear();
          useLiveStore.getState().clearLive();
        }
        useLayersStore.getState().clearSlice(screen.id);
      }

      if (msg.kind === 'pageError') {
        setPreview(screen.id, { pageError: msg.payload.message });
        report(new Error(msg.payload.message), { region: 'preview', screenId: screen.id });
      }

      if (msg.kind === 'response') {
        if (msg.payload.ok === false) {
          rejectPending(msg.payload.to, new Error(msg.payload.error ?? 'Request failed'));
        } else {
          resolvePending(msg.payload.to, msg.payload.data);
        }
      }

      if (msg.kind === 'key') {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: msg.payload.key,
            shiftKey: msg.payload.shift,
            ctrlKey: msg.payload.ctrl,
            metaKey: msg.payload.meta,
            bubbles: true,
          }),
        );
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [screen.id, setPreview]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    setPreview(screen.id, { agentReady: false, status: 'loading', pageError: null });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const err = new Error('Agent handshake timed out');
      setPreview(screen.id, { status: 'error', error: err.message });
      report(err, { region: 'preview', screenId: screen.id });
    }, 10_000);

    iframe.contentWindow.postMessage(makeMsg('hello', { screenId: screen.id }), '*');
  };

  const onError = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const err = new Error('Page failed to load');
    setPreview(screen.id, { status: 'error', error: err.message });
    report(err, { region: 'preview', screenId: screen.id });
  };

  const isError = preview?.status === 'error';
  const isReady = preview?.status === 'ready';
  const pageError = preview?.pageError ?? null;

  return (
    <div className="flex w-[1280px] flex-none flex-col" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-2 select-none truncate text-xs font-medium text-panel-muted">
        {screen.name}
      </div>
      <div className="relative h-[800px] w-[1280px]">
        <iframe
          ref={iframeRef}
          src={screen.url}
          title={screen.name}
          width={1280}
          height={800}
          onLoad={onLoad}
          onError={onError}
          className="block border-0"
        />
        <Overlay screenId={screen.id} />
        {isReady && pageError && (
          <div
            className="absolute bottom-2 right-2 z-10 cursor-default select-none rounded bg-red-950/90 px-2 py-0.5 text-[11px] text-red-300 ring-1 ring-red-800/60"
            title={pageError}
          >
            Page error
          </div>
        )}
        {!isReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-panel-bg/80">
            {isError ? (
              <span className="text-sm text-panel-text">{preview?.error ?? 'Error'}</span>
            ) : (
              <span className="text-sm text-panel-muted">Loading…</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

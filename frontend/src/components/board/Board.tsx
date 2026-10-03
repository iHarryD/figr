import { useEffect, useLayoutEffect, useRef } from 'react';
import { useBoardStore, useHoverStore, useScreensStore, useSelectionStore } from '../../state';
import { fetchScreens } from '../../api';
import { report } from '../../utilities';
import { Preview } from '../Preview';

const COLS = 4;
const GAP = 32;

const zoomAt = (vpX: number, vpY: number, deltaY: number) => {
  useBoardStore.setState((s) => {
    const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(0.25, Math.min(4, s.zoom * factor));
    const bx = (vpX - s.pan.x) / s.zoom;
    const by = (vpY - s.pan.y) / s.zoom;
    return { zoom: newZoom, pan: { x: vpX - bx * newZoom, y: vpY - by * newZoom } };
  });
};

export const Board = () => {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const pan = useBoardStore((s) => s.pan);
  const zoom = useBoardStore((s) => s.zoom);
  const status = useScreensStore((s) => s.status);
  const list = useScreensStore((s) => s.list);
  const error = useScreensStore((s) => s.error);
  const retryCount = useScreensStore((s) => s.retryCount);
  const setLoading = useScreensStore((s) => s.setLoading);
  const setScreens = useScreensStore((s) => s.setScreens);
  const setError = useScreensStore((s) => s.setError);
  const retry = useScreensStore((s) => s.retry);

  useEffect(() => {
    setLoading();
    const ac = new AbortController();
    fetchScreens(ac.signal)
      .then(setScreens)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          report(err, { region: 'board', screenId: null });
        }
      });
    return () => ac.abort();
  }, [retryCount]);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const rows = Math.ceil(24 / COLS);
    const gridW = COLS * 1280 + (COLS - 1) * GAP;
    const gridH = rows * 800 + (rows - 1) * GAP;
    const z = 0.25;
    useBoardStore.setState({
      zoom: z,
      pan: { x: (width - gridW * z) / 2, y: (height - gridH * z) / 2 },
    });
  }, []);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        useHoverStore.getState().setHover(null);
        zoomAt(e.clientX, e.clientY, e.deltaY);
      } else {
        useBoardStore.setState((s) => ({
          pan: { x: s.pan.x - e.deltaX, y: s.pan.y - e.deltaY },
        }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    useHoverStore.getState().setHover(null);
    const { pan: p } = useBoardStore.getState();
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: p.x, panY: p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    useBoardStore.getState().setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        useSelectionStore.getState().clear();
      }
    }
    dragRef.current = null;
  };

  return (
    <div
      ref={boardRef}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-panel-muted">Loading screens…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded bg-panel-border px-6 py-4">
            <span className="text-sm text-panel-text">{error}</span>
            <button
              className="rounded bg-white/10 px-3 py-1.5 text-xs text-panel-text hover:bg-white/20"
              onClick={retry}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={
          {
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            '--zoom': zoom,
          } as React.CSSProperties
        }
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1280px)`, gap: GAP }}
        >
          {list.map((screen) => (
            <Preview key={screen.id} screen={screen} onAgentWheel={zoomAt} />
          ))}
        </div>
      </div>
    </div>
  );
};

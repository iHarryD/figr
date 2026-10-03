import { useState } from 'react';
import { makeMsg } from '../protocol';
import { getContentWindow, usePreviewsStore, useScreensStore, useSelectionStore } from '../state';
import { cn, devFlags } from '../utilities';

const isDev = new URLSearchParams(window.location.search).has('dev');

const DevBtn = ({
  label,
  on,
  onClick,
}: {
  label: string;
  on?: boolean;
  onClick: () => void;
}) => (
  <button
    className={cn(
      'w-full rounded px-2 py-1 text-left text-[11px]',
      on ? 'bg-red-900/50 text-red-300' : 'text-panel-text hover:bg-white/10',
    )}
    onClick={onClick}
  >
    {label}
  </button>
);

export const DevMenu = () => {
  const [open, setOpen] = useState(false);
  const [, forceRender] = useState(0);

  if (!isDev) return null;

  const activeScreenWin = () => {
    const sid = useSelectionStore.getState().screenId;
    return sid ? getContentWindow(sid) : null;
  };

  const post = (kind: 'pageError' | 'treeQuery' | 'handshake' | 'clickHandler') => {
    const win = activeScreenWin();
    if (win) win.postMessage(makeMsg('devFail', { kind }), '*');
  };

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="pointer-events-auto w-52 rounded border border-panel-border bg-panel-bg shadow-xl">
          <div className="border-b border-panel-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-panel-muted">
            Dev Menu
          </div>
          <div className="space-y-0.5 p-2">
            <DevBtn
              label="Fail /screens"
              on={devFlags.failScreens}
              onClick={() => {
                devFlags.failScreens = !devFlags.failScreens;
                if (devFlags.failScreens) {
                  useScreensStore.getState().setError('[dev] /screens forced failure');
                } else {
                  useScreensStore.getState().retry();
                }
                forceRender((n) => n + 1);
              }}
            />
            <DevBtn
              label="Fail /elements/:key"
              on={devFlags.failElements}
              onClick={() => {
                devFlags.failElements = !devFlags.failElements;
                forceRender((n) => n + 1);
              }}
            />
            <DevBtn
              label="Throw in inspector render"
              on={devFlags.throwInspector}
              onClick={() => {
                devFlags.throwInspector = !devFlags.throwInspector;
                forceRender((n) => n + 1);
              }}
            />
            <DevBtn
              label="Throw in click handler"
              on={devFlags.throwClickHandler}
              onClick={() => {
                devFlags.throwClickHandler = !devFlags.throwClickHandler;
                post('clickHandler');
                forceRender((n) => n + 1);
              }}
            />
            <DevBtn
              label="Fail preview handshake"
              onClick={() => {
                const sid = useSelectionStore.getState().screenId;
                if (sid) {
                  post('handshake');
                  usePreviewsStore.getState().setPreview(sid, {
                    status: 'error',
                    error: '[dev] handshake failure',
                    agentReady: false,
                  });
                }
              }}
            />
            <DevBtn
              label="Throw agent tree query"
              onClick={() => post('treeQuery')}
            />
            <DevBtn
              label="Throw a page error"
              onClick={() => post('pageError')}
            />
          </div>
        </div>
      )}
      <button
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded bg-panel-border text-[10px] font-bold text-panel-muted shadow hover:bg-white/10"
        onClick={() => setOpen((v) => !v)}
        title="Dev menu (?dev=1)"
      >
        D
      </button>
    </div>
  );
};

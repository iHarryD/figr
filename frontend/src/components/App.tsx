import { useEffect } from 'react';
import { makeMsg } from '../protocol';
import { useBoardStore, getContentWindow, useSelectionStore } from '../state';
import { registerPending } from '../utilities';
import { Board } from './board';
import { DevMenu } from './DevMenu';
import { ErrorBoundary } from './ErrorBoundary';
import { InspectorPanel } from './InspectorPanel';
import { LayersPanel } from './LayersPanel';
import { Toolbar } from './Toolbar';

export const App = () => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'v' || e.key === 'V') useBoardStore.getState().setMode('select');
      if (e.key === 'i' || e.key === 'I') useBoardStore.getState().setMode('interact');

      if (e.key === 'Escape') {
        useSelectionStore.getState().clear();
        return;
      }

      const { screenId, anchorEid } = useSelectionStore.getState();
      if (!screenId || !anchorEid) return;

      type Dir = 'parent' | 'firstChild' | 'prevSibling' | 'nextSibling';
      let direction: Dir | null = null;
      if (e.key === 'Enter' && !e.shiftKey) direction = 'firstChild';
      else if (e.key === 'Enter' && e.shiftKey) direction = 'parent';
      else if (e.key === 'Tab' && !e.shiftKey) direction = 'nextSibling';
      else if (e.key === 'Tab' && e.shiftKey) direction = 'prevSibling';

      if (!direction) return;
      e.preventDefault();

      const win = getContentWindow(screenId);
      if (!win) return;

      const msg = makeMsg('getRelatives', { eid: anchorEid });
      const dir = direction;
      registerPending(msg.id, (data) => {
        const rel = data as Record<string, { eid: string } | undefined>;
        let target = rel[dir];
        if (!target && dir === 'nextSibling') target = rel['firstSibling'];
        if (!target && dir === 'prevSibling') target = rel['lastSibling'];
        if (!target) return;
        useSelectionStore.getState().set(screenId, [target.eid], target.eid);
      });
      win.postMessage(msg, '*');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-panel-bg text-panel-text">
      <ErrorBoundary label="Layers panel error" region="layers">
        <LayersPanel />
      </ErrorBoundary>
      <div className="relative flex-1 overflow-hidden">
        <Board />
        <Toolbar />
      </div>
      <ErrorBoundary label="Inspector error" region="inspector">
        <InspectorPanel />
      </ErrorBoundary>
      <DevMenu />
    </div>
  );
};

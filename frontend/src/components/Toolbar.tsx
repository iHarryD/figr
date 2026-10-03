import { useBoardStore } from '../state';
import { cn } from '../utilities';

export const Toolbar = () => {
  const mode = useBoardStore((s) => s.mode);
  const setMode = useBoardStore((s) => s.setMode);

  return (
    <div className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-panel-border px-1 py-1 shadow-xl">
      <button
        className={cn(
          'flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors',
          mode === 'select'
            ? 'bg-panel-bg text-panel-text'
            : 'text-panel-muted hover:text-panel-text',
        )}
        onClick={() => setMode('select')}
      >
        Select
        <kbd className="text-[10px] opacity-40">V</kbd>
      </button>
      <button
        className={cn(
          'flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors',
          mode === 'interact'
            ? 'bg-panel-bg text-panel-text'
            : 'text-panel-muted hover:text-panel-text',
        )}
        onClick={() => setMode('interact')}
      >
        Interact
        <kbd className="text-[10px] opacity-40">I</kbd>
      </button>
    </div>
  );
};

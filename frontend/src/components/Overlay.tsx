import { useBoardStore, useHoverStore, useLiveStore, useRectsStore, useSelectionStore } from '../state';

interface OverlayProps {
  screenId: string;
}

const zoomLabel: React.CSSProperties = {
  fontSize: 'calc(10px / var(--zoom, 1))',
  lineHeight: 'calc(16px / var(--zoom, 1))',
  padding: 'calc(1px / var(--zoom, 1)) calc(4px / var(--zoom, 1))',
};

export const Overlay = ({ screenId }: OverlayProps) => {
  const hover = useHoverStore((s) => s.hover);
  const selScreenId = useSelectionStore((s) => s.screenId);
  const selEids = useSelectionStore((s) => s.eids);
  const mode = useBoardStore((s) => s.mode);
  const screenRects = useRectsStore((s) => s.rects[screenId]) ?? {};
  const live = useLiveStore((s) => s.live);

  const hoverRect = hover?.screenId === screenId && hover.rect ? hover.rect : null;
  const selectedRects =
    mode === 'interact' || selScreenId !== screenId
      ? []
      : selEids.flatMap((eid) => {
          const rect = screenRects[eid];
          return rect ? [{ eid, rect }] : [];
        });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {hoverRect && (
        <>
          <div
            className="absolute box-border border border-outline-hover"
            style={
              {
                left: hoverRect.x,
                top: hoverRect.y,
                width: hoverRect.width,
                height: hoverRect.height,
                borderWidth: 'calc(1px / var(--zoom, 1))',
              } as React.CSSProperties
            }
          />
          <div
            className="absolute whitespace-nowrap rounded-sm bg-outline-hover font-medium text-white"
            style={
              {
                left: hoverRect.x,
                top: hoverRect.y >= 20 ? hoverRect.y - 20 : hoverRect.y + hoverRect.height + 2,
                ...zoomLabel,
              } as React.CSSProperties
            }
          >
            {hover!.name ?? live[hover!.eid]?.name ?? hover!.eid}
          </div>
        </>
      )}
      {selectedRects.map(({ eid, rect }) => {
        const labelAbove = rect.y >= 20;
        const labelY = labelAbove ? rect.y - 20 : rect.y + rect.height + 2;
        return (
          <div key={eid}>
            <div
              className="absolute box-border border-2 border-outline-selected"
              style={
                {
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  borderWidth: 'calc(2px / var(--zoom, 1))',
                } as React.CSSProperties
              }
            />
            <div
              className="absolute whitespace-nowrap rounded-sm bg-outline-selected font-medium text-white"
              style={
                {
                  left: rect.x,
                  top: labelY,
                  ...zoomLabel,
                } as React.CSSProperties
              }
            >
              {live[eid]?.name ?? eid}
            </div>
          </div>
        );
      })}
    </div>
  );
};

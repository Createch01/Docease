/* DocEase prescription editor — A4 canvas with pointer dragging.
   Renders every element at its stored mm position, scaled by `zoom`.
   Dragging converts screen pixels back into mm, snaps to a 0.5 mm grid and
   to alignment guides (page centre + the 18 mm margins + sibling edges).
*/

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { DoctorInfo } from '../../types';
import { RxEditorElement, RxLayoutConfig, RX_A4, RX_FONTS, rxResolveText } from './rxEditorModel';
import { RxIcon } from './RxContactIcons';

const SNAP_TOLERANCE_MM = 1.6;

interface RxNodeProps {
  el: RxEditorElement;
  doctor?: DoctorInfo | null;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>, el: RxEditorElement) => void;
  interactive?: boolean;
}

export const RxNode: React.FC<RxNodeProps> = ({ el, doctor, selected, onPointerDown, interactive = true }) => {
  const F = RX_FONTS.find(f => f.id === el.fontFamily) || RX_FONTS[0];
  const common: React.CSSProperties = {
    position: 'absolute',
    left: `${el.x}mm`,
    top: `${el.y}mm`,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: 'top left',
    cursor: interactive ? (el.locked ? 'default' : 'move') : 'default',
  };

  const nodeProps = {
    className: 'ed-node',
    'data-sel': selected ? '1' : '0',
    'data-id': el.id,
    onPointerDown: interactive && !el.locked && onPointerDown ? (e: React.PointerEvent<HTMLDivElement>) => onPointerDown(e, el) : undefined,
  };

  if (!el.visible) return null;

  if (el.type === 'logo') {
    const width = el.w ?? 34;
    return (
      <div {...nodeProps} style={{ ...common, width: `${width}mm` }}>
        {el.src ? (
          <img src={el.src} alt="" style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} />
        ) : (
          <div
            className="ed-noprint flex flex-col items-center justify-center"
            style={{
              width: '100%',
              height: `${width * 0.62}mm`,
              border: '1px dashed #CBD5E0',
              borderRadius: 4,
              color: '#94A3B8',
              fontSize: 8,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              gap: 2,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.8" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            logo
          </div>
        )}
      </div>
    );
  }

  if (el.type === 'line') {
    return (
      <div
        {...nodeProps}
        style={{
          ...common,
          width: `${el.length ?? 174}mm`,
          height: `${Math.max(el.thickness ?? 0.5, 0.3)}mm`,
          background: el.color || '#1A6B8A',
          borderRadius: '0.2mm',
        }}
      />
    );
  }

  if (el.type === 'icon') {
    return (
      <div {...nodeProps} style={{ ...common }}>
        <RxIcon
          name={el.field}
          style={el.iconStyle}
          size={(el.iconSize ?? 6) * RX_A4.mmToPx}
          color={el.iconColor || '#1A6B8A'}
          strokeWidth={1.7}
        />
      </div>
    );
  }

  if (el.type === 'body') {
    return (
      <div
        {...nodeProps}
        style={{
          ...common,
          width: `${el.w ?? 174}mm`,
          height: `${el.h ?? 150}mm`,
          border: '1px dashed #D6DFE8',
          borderRadius: 3,
          background: 'rgba(240,244,248,.35)',
        }}
      >
        <div
          className="ed-noprint flex items-center gap-1.5"
          style={{ padding: '2mm 3mm', color: '#94A3B8', fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 3h8a6 6 0 010 12H6V3M6 15v6M13 15l7 6M20 15l-7 6" />
          </svg>
          Zone de prescription — les médicaments s’impriment ici
        </div>
      </div>
    );
  }

  /* text + contact */
  const textStyle: React.CSSProperties = {
    fontFamily: F.stack,
    fontSize: `${el.fontSize ?? 10}pt`,
    fontWeight: el.fontWeight ?? 500,
    color: el.color || '#0F172A',
    textAlign: el.align || 'left',
    letterSpacing: el.letterSpacing ? `${el.letterSpacing / 10}em` : undefined,
    lineHeight: el.lineHeight ?? 1.35,
    textTransform: el.uppercase ? 'uppercase' : undefined,
    direction: el.rtl ? 'rtl' : undefined,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    margin: 0,
  };
  const value = rxResolveText(el, doctor);

  if (el.type === 'contact') {
    return (
      <div {...nodeProps} style={{ ...common, width: `${el.width ?? 90}mm` }}>
        <div className="flex items-start" style={{ gap: `${el.iconGap ?? 2.2}mm`, flexDirection: el.rtl ? 'row-reverse' : 'row' }}>
          {el.showIcon && (
            <span style={{ marginTop: '0.4mm', flexShrink: 0 }}>
              <RxIcon
                name={el.field}
                style={el.iconStyle}
                size={(el.iconSize ?? 3.6) * RX_A4.mmToPx}
                color={el.iconColor || '#1A6B8A'}
                strokeWidth={1.7}
              />
            </span>
          )}
          <p style={{ ...textStyle, flex: 1, minWidth: 0 }}>{value}</p>
        </div>
      </div>
    );
  }

  return (
    <div {...nodeProps} style={{ ...common, width: `${el.width ?? 80}mm` }}>
      <p style={textStyle}>{value}</p>
    </div>
  );
};

export interface RxCanvasProps {
  config: RxLayoutConfig;
  doctor?: DoctorInfo | null;
  zoom: number;
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<RxEditorElement>) => void;
  interactive?: boolean;
}

export const RxCanvas: React.FC<RxCanvasProps> = ({
  config,
  doctor,
  zoom,
  selectedId,
  onSelect,
  onChange,
  interactive = true,
}) => {
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; at: number }[]>([]);

  const { w: PW, h: PH, mmToPx } = RX_A4;

  /* candidate snap lines from siblings + page furniture */
  const snapLines = useMemo(() => {
    const xs = [0, 18, PW / 2, PW - 18, PW];
    const ys = [0, 16, PH / 2, PH - 18, PH];
    config.elements.forEach(e => {
      if (e.id === selectedId || !e.visible) return;
      xs.push(e.x);
      ys.push(e.y);
      const w = e.type === 'line' ? (e.length ?? 0) : ((e.w ?? e.width) ?? 0);
      if (w) xs.push(e.x + w);
    });
    return { xs: Array.from(new Set(xs)), ys: Array.from(new Set(ys)) };
  }, [config.elements, selectedId, PW, PH]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, el: RxEditorElement) => {
      e.stopPropagation();
      onSelect(el.id);
      if (el.locked) return;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch (_) {}
      drag.current = { id: el.id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
    },
    [onSelect]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const k = mmToPx * zoom;
      let nx = d.ox + (e.clientX - d.sx) / k;
      let ny = d.oy + (e.clientY - d.sy) / k;

      const hit: { axis: 'x' | 'y'; at: number }[] = [];
      const nearest = (v: number, list: number[]) => {
        let best: number | null = null;
        let bd = SNAP_TOLERANCE_MM;
        list.forEach(c => {
          const dd = Math.abs(v - c);
          if (dd < bd) {
            bd = dd;
            best = c;
          }
        });
        return best;
      };
      const sx = nearest(nx, snapLines.xs);
      if (sx !== null) {
        nx = sx;
        hit.push({ axis: 'x', at: sx });
      }
      const sy = nearest(ny, snapLines.ys);
      if (sy !== null) {
        ny = sy;
        hit.push({ axis: 'y', at: sy });
      }

      nx = Math.round(Math.max(-20, Math.min(PW + 10, nx)) * 2) / 2;
      ny = Math.round(Math.max(-20, Math.min(PH + 10, ny)) * 2) / 2;

      setGuides(hit);
      onChange(d.id, { x: nx, y: ny });
    },
    [zoom, mmToPx, snapLines, onChange, PW, PH]
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    setGuides([]);
  }, []);

  return (
    <div
      ref={pageRef}
      className="ed-sheet relative bg-white shrink-0"
      style={{
        width: `${PW * mmToPx * zoom}px`,
        height: `${PH * mmToPx * zoom}px`,
        boxShadow: '0 1px 3px rgba(15,23,42,.10), 0 14px 40px rgba(15,23,42,.14)',
      }}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? endDrag : undefined}
      onPointerLeave={interactive ? endDrag : undefined}
      onPointerDown={interactive ? () => onSelect(null) : undefined}
    >
      <div
        style={{
          width: `${PW}mm`,
          height: `${PH}mm`,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          position: 'relative',
          background: config.page?.background || '#FFFFFF',
        }}
      >
        {/* margin guides */}
        {interactive && (
          <div
            className="ed-noprint absolute pointer-events-none"
            style={{ inset: 0, outline: '1px dashed rgba(26,107,138,.14)', outlineOffset: '-18mm' }}
          />
        )}

        {config.elements.map(el => (
          <RxNode
            key={el.id}
            el={el}
            doctor={doctor}
            selected={el.id === selectedId}
            onPointerDown={onPointerDown}
            interactive={interactive}
          />
        ))}

        {/* live snap guides */}
        {guides.map((g, i) =>
          g.axis === 'x' ? (
            <div key={i} className="ed-guide" style={{ left: `${g.at}mm`, top: 0, width: '0.3mm', height: '100%' }} />
          ) : (
            <div key={i} className="ed-guide" style={{ top: `${g.at}mm`, left: 0, height: '0.3mm', width: '100%' }} />
          )
        )}
      </div>
    </div>
  );
};

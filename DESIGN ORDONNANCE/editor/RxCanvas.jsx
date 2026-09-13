/* DocEase prescription editor — A4 canvas with pointer dragging.

   Renders every element at its stored mm position, scaled by `zoom`.
   Dragging converts screen pixels back into mm, snaps to a 0.5 mm grid and
   to alignment guides (page centre + the 18 mm margins + sibling edges).

   Exports (window): RxCanvas, RxNode
*/
/* IIFE-SCOPED — every <script type="text/babel"> runs as a classic script and
   shares ONE global lexical scope, so bare top-level consts across these files
   would collide. The IIFE keeps internals private; the Object.assign(window, …)
   at the bottom is the only cross-file contract. */
(() => {
  const { useRef, useState, useCallback, useMemo } = React;

  const SNAP_TOLERANCE_MM = 1.6;

  /* ── one rendered element ── */
  function RxNode({ el, doctor, selected, onPointerDown, interactive }) {
    const F = window.RX_FONTS.find(f => f.id === el.fontFamily) || window.RX_FONTS[0];
    const common = {
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
      onPointerDown: interactive && !el.locked ? (e) => onPointerDown(e, el) : undefined,
    };

    if (!el.visible) return null;

    if (el.type === 'logo') {
      return (
        <div {...nodeProps} style={{ ...common, width: `${el.w}mm` }}>
          {el.src
            ? <img src={el.src} alt="" style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} />
            : (
              <div className="ed-noprint flex flex-col items-center justify-center"
                   style={{ width: '100%', height: `${el.w * 0.62}mm`, border: '1px dashed #CBD5E0',
                            borderRadius: 4, color: '#94A3B8', fontSize: 8, letterSpacing: '.08em',
                            textTransform: 'uppercase', gap: 2 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.8" />
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
        <div {...nodeProps} style={{ ...common, width: `${el.length}mm`, height: `${Math.max(el.thickness, 0.3)}mm`,
                                     background: el.color, borderRadius: '0.2mm' }} />
      );
    }

    if (el.type === 'icon') {
      return (
        <div {...nodeProps} style={{ ...common }}>
          <window.RxIcon name={el.field} style={el.iconStyle}
                         size={el.iconSize * window.RX_A4.mmToPx}
                         color={el.iconColor} strokeWidth={1.7} />
        </div>
      );
    }

    if (el.type === 'body') {
      return (
        <div {...nodeProps}
             style={{ ...common, width: `${el.w}mm`, height: `${el.h}mm`,
                      border: '1px dashed #D6DFE8', borderRadius: 3, background: 'rgba(240,244,248,.35)' }}>
          <div className="ed-noprint flex items-center gap-1.5"
               style={{ padding: '2mm 3mm', color: '#94A3B8', fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 3h8a6 6 0 010 12H6V3M6 15v6M13 15l7 6M20 15l-7 6" />
            </svg>
            Zone de prescription — les médicaments s’impriment ici
          </div>
        </div>
      );
    }

    /* text + contact */
    const textStyle = {
      fontFamily: F.stack,
      fontSize: `${el.fontSize}pt`,
      fontWeight: el.fontWeight,
      color: el.color,
      textAlign: el.align,
      letterSpacing: el.letterSpacing ? `${el.letterSpacing / 10}em` : undefined,
      lineHeight: el.lineHeight,
      textTransform: el.uppercase ? 'uppercase' : undefined,
      direction: el.rtl ? 'rtl' : undefined,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
      margin: 0,
    };
    const value = window.rxResolveText(el, doctor);

    if (el.type === 'contact') {
      return (
        <div {...nodeProps} style={{ ...common, width: `${el.width}mm` }}>
          <div className="flex items-start" style={{ gap: `${el.iconGap}mm`, flexDirection: el.rtl ? 'row-reverse' : 'row' }}>
            {el.showIcon && (
              <span style={{ marginTop: '0.4mm', flexShrink: 0 }}>
                <window.RxIcon name={el.field} style={el.iconStyle}
                               size={el.iconSize * window.RX_A4.mmToPx}
                               color={el.iconColor} strokeWidth={1.7} />
              </span>
            )}
            <p style={{ ...textStyle, flex: 1, minWidth: 0 }}>{value}</p>
          </div>
        </div>
      );
    }

    return (
      <div {...nodeProps} style={{ ...common, width: `${el.width}mm` }}>
        <p style={textStyle}>{value}</p>
      </div>
    );
  }

  /* ── the page ── */
  function RxCanvas({ config, doctor, zoom, selectedId, onSelect, onChange, interactive = true }) {
    const pageRef = useRef(null);
    const drag = useRef(null);
    const [guides, setGuides] = useState([]);

    const { w: PW, h: PH, mmToPx } = window.RX_A4;

    /* candidate snap lines from siblings + page furniture */
    const snapLines = useMemo(() => {
      const xs = [0, 18, PW / 2, PW - 18, PW];
      const ys = [0, 16, PH / 2, PH - 18, PH];
      config.elements.forEach(e => {
        if (e.id === selectedId || !e.visible) return;
        xs.push(e.x);
        ys.push(e.y);
        const w = e.type === 'line' ? e.length : (e.w ?? e.width);
        if (w) xs.push(e.x + w);
      });
      return { xs: [...new Set(xs)], ys: [...new Set(ys)] };
    }, [config.elements, selectedId, PW, PH]);

    const onPointerDown = useCallback((e, el) => {
      e.stopPropagation();
      onSelect(el.id);
      if (el.locked) return;
      // Guarded: throws NotFoundError if the pointer id is not currently active,
      // which would otherwise abort drag setup entirely.
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (_) {}
      drag.current = { id: el.id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
    }, [onSelect]);

    const onPointerMove = useCallback((e) => {
      const d = drag.current;
      if (!d) return;
      const k = mmToPx * zoom;
      let nx = d.ox + (e.clientX - d.sx) / k;
      let ny = d.oy + (e.clientY - d.sy) / k;

      const hit = [];
      const nearest = (v, list) => {
        let best = null, bd = SNAP_TOLERANCE_MM;
        list.forEach(c => { const dd = Math.abs(v - c); if (dd < bd) { bd = dd; best = c; } });
        return best;
      };
      const sx = nearest(nx, snapLines.xs);
      if (sx !== null) { nx = sx; hit.push({ axis: 'x', at: sx }); }
      const sy = nearest(ny, snapLines.ys);
      if (sy !== null) { ny = sy; hit.push({ axis: 'y', at: sy }); }

      nx = Math.round(Math.max(-20, Math.min(PW + 10, nx)) * 2) / 2;
      ny = Math.round(Math.max(-20, Math.min(PH + 10, ny)) * 2) / 2;

      setGuides(hit);
      onChange(d.id, { x: nx, y: ny });
    }, [zoom, mmToPx, snapLines, onChange, PW, PH]);

    const endDrag = useCallback(() => { drag.current = null; setGuides([]); }, []);

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
        <div style={{ width: `${PW}mm`, height: `${PH}mm`, transform: `scale(${zoom})`, transformOrigin: 'top left',
                      position: 'relative', background: config.page.background }}>
          {/* margin guides */}
          {interactive && (
            <div className="ed-noprint absolute pointer-events-none"
                 style={{ inset: 0, outline: '1px dashed rgba(26,107,138,.14)', outlineOffset: '-18mm' }} />
          )}

          {config.elements.map(el => (
            <RxNode key={el.id} el={el} doctor={doctor}
                    selected={el.id === selectedId}
                    onPointerDown={onPointerDown}
                    interactive={interactive} />
          ))}

          {/* live snap guides */}
          {guides.map((g, i) => g.axis === 'x'
            ? <div key={i} className="ed-guide" style={{ left: `${g.at}mm`, top: 0, width: '0.3mm', height: '100%' }} />
            : <div key={i} className="ed-guide" style={{ top: `${g.at}mm`, left: 0, height: '0.3mm', width: '100%' }} />
          )}
        </div>
      </div>
    );
  }

  Object.assign(window, { RxCanvas, RxNode });
})();

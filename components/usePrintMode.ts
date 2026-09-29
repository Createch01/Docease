import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * True while the browser is printing (window.print() or Ctrl+P).
 *
 * Documents are rendered several times on a page (screen preview, print copy,
 * PDF export copy) and the templates' SVG gradients use fixed ids, so
 * `url(#id)` resolves to the FIRST copy — the preview, which is display:none
 * at print time, so the printed copy loses its gradients. Screens use this to
 * mount only the print copy while printing. `beforeprint` fires before the
 * print snapshot and flushSync commits the change synchronously.
 */
export function usePrintMode(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printing;
}

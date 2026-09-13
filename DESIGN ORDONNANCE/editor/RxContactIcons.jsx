/* DocEase — contact icon set.
   Eight contact types, each in an outline and a filled variant, drawn as
   inline SVG on a 24×24 grid. Redrawn from the reference sheet supplied
   by the user. No external assets.

   Exports (window):
     RX_ICON_KEYS   ordered list of icon ids
     RX_ICON_LABELS id → French label
     RxIcon         <RxIcon name style size color strokeWidth />
*/
/* IIFE-SCOPED — every <script type="text/babel"> runs as a classic script and
   shares ONE global lexical scope, so bare top-level consts across these files
   would collide. The IIFE keeps internals private; the Object.assign(window, …)
   at the bottom is the only cross-file contract. */
(() => {
  const RX_ICON_KEYS = ['name', 'address', 'location', 'phone', 'mail', 'website', 'cellphone', 'fax'];

  const RX_ICON_LABELS = {
    name: 'Nom', address: 'Adresse', location: 'Localisation', phone: 'Téléphone',
    mail: 'E-mail', website: 'Site web', cellphone: 'Mobile', fax: 'Fax',
  };

  /* Each entry: { outline: (sw) => nodes, filled: () => nodes } */
  const RX_ICON_PATHS = {
    name: {
      outline: (sw) => (
        <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="7.6" r="4.1" />
          <path d="M3.6 21c0-4.3 3.8-7.6 8.4-7.6s8.4 3.3 8.4 7.6" />
        </g>
      ),
      filled: () => (
        <g fill="currentColor">
          <circle cx="12" cy="7.4" r="4.6" />
          <path d="M12 13c-4.8 0-8.7 3.6-8.7 8h17.4c0-4.4-3.9-8-8.7-8z" />
        </g>
      ),
    },
    address: {
      outline: (sw) => (
        <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.2 12 3.4l9 7.8" />
          <path d="M5.2 12.6V20a.8.8 0 0 0 .8.8h12a.8.8 0 0 0 .8-.8v-7.4" />
          <path d="M9.8 20.8v-5.2a2.2 2.2 0 0 1 4.4 0v5.2" />
          <path d="M6.4 8.6V5.1h2.3v1.5" />
        </g>
      ),
      filled: () => (
        <g fill="currentColor">
          <path d="M12 2.6 1.8 11.5h3.1V21h5V15a2.1 2.1 0 0 1 4.2 0v6h5v-9.5h3.1z" />
          <path d="M6.2 4.6h2.6v3.1L6.2 9.9z" />
        </g>
      ),
    },
    location: {
      outline: (sw) => (
        <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21.6c3.9-5.1 6.4-8.7 6.4-11.7A6.4 6.4 0 0 0 5.6 9.9c0 3 2.5 6.6 6.4 11.7z" />
          <circle cx="12" cy="9.7" r="2.5" />
        </g>
      ),
      filled: () => (
        <path fill="currentColor" fillRule="evenodd"
              d="M12 22.2c4.2-5.4 6.9-9.3 6.9-12.3a6.9 6.9 0 1 0-13.8 0c0 3 2.7 6.9 6.9 12.3zm0-9.6a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z" />
      ),
    },
    phone: {
      outline: (sw) => (
        <path fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
              d="M7.3 3.1c.8-.7 2-.5 2.6.4l2 3.1c.5.8.3 1.8-.4 2.4l-1.3 1c-.3.2-.4.6-.3 1 .8 2 2.6 3.8 4.6 4.6.4.1.8 0 1-.3l1-1.3c.6-.7 1.6-.9 2.4-.4l3.1 2c.9.6 1.1 1.8.4 2.6l-1.5 1.6c-1.1 1.2-2.9 1.6-4.4 1C11.9 19.4 7 14.5 4.7 8.6c-.6-1.5-.2-3.3 1-4.4z" />
      ),
      filled: () => (
        <path fill="currentColor"
              d="M7.1 2.6c1.1-.9 2.7-.6 3.5.6l2.1 3.3c.7 1.1.4 2.5-.6 3.3l-1 .8c.7 1.6 2.1 3 3.7 3.7l.8-1c.8-1 2.2-1.3 3.3-.6l3.3 2.1c1.2.8 1.5 2.4.6 3.5l-1.6 1.8c-1.4 1.5-3.6 2-5.4 1.2C11.5 20 6.4 14.9 4 8.5c-.7-1.9-.3-4 1.2-5.4z" />
      ),
    },
    mail: {
      outline: (sw) => (
        <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.4" y="5.2" width="19.2" height="13.6" rx="1" />
          <path d="M2.9 5.8 12 13l9.1-7.2" />
        </g>
      ),
      filled: () => (
        <g>
          <rect x="2" y="5" width="20" height="14" rx="1.2" fill="currentColor" />
          <path d="M2.9 6.1 12 13.4l9.1-7.3" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
        </g>
      ),
    },
    website: {
      outline: (sw) => (
        <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9.2" />
          <path d="M2.9 12h18.2" />
          <path d="M12 2.8c2.6 2.4 4 5.7 4 9.2s-1.4 6.8-4 9.2c-2.6-2.4-4-5.7-4-9.2s1.4-6.8 4-9.2z" />
          <path d="M4.6 6.4c2.2 1.2 4.7 1.8 7.4 1.8s5.2-.6 7.4-1.8" />
          <path d="M4.6 17.6c2.2-1.2 4.7-1.8 7.4-1.8s5.2.6 7.4 1.8" />
        </g>
      ),
      filled: () => (
        <g>
          <circle cx="12" cy="12" r="9.6" fill="currentColor" />
          <g fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2.7 12h18.6" />
            <path d="M12 2.5c2.7 2.5 4.2 5.9 4.2 9.5s-1.5 7-4.2 9.5c-2.7-2.5-4.2-5.9-4.2-9.5S9.3 5 12 2.5z" />
            <path d="M4.4 6.2C6.6 7.4 9.2 8 12 8s5.4-.6 7.6-1.8" />
            <path d="M4.4 17.8C6.6 16.6 9.2 16 12 16s5.4.6 7.6 1.8" />
          </g>
        </g>
      ),
    },
    cellphone: {
      outline: (sw) => (
        <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="6.4" y="2.4" width="11.2" height="19.2" rx="1.4" />
          <path d="M10.2 4.9h3.6" />
          <path d="M9.6 19.1h4.8" />
        </g>
      ),
      filled: () => (
        <g>
          <rect x="6" y="2" width="12" height="20" rx="1.6" fill="currentColor" />
          <g stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
            <path d="M10.3 4.7h3.4" />
            <path d="M9.7 19.3h4.6" />
          </g>
        </g>
      ),
    },
    fax: {
      outline: (sw) => (
        <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.4 8.2V3.4h9.4v4.8" />
          <path d="M9.6 5.6h4.8" />
          <rect x="2.6" y="8.2" width="18.8" height="12.4" rx="1.1" />
          <rect x="5.1" y="11" width="4.4" height="6.8" rx=".7" />
          <path d="M12.2 11.4h6.6M12.2 14h6.6M12.2 16.6h6.6" />
        </g>
      ),
      filled: () => (
        <g>
          <path fill="currentColor" d="M7 3h10v5.4H7z" />
          <path d="M9.5 5.4h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="2.2" y="8.4" width="19.6" height="12.6" rx="1.3" fill="currentColor" />
          <rect x="5" y="11.1" width="4.6" height="7" rx=".8" fill="#fff" />
          <g stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12.3 11.6h6.5M12.3 14.2h6.5M12.3 16.8h6.5" />
          </g>
        </g>
      ),
    },
  };

  /** name: icon id · style: 'outline' | 'filled' */
  const RxIcon = ({ name, style = 'outline', size = 16, color = 'currentColor', strokeWidth = 1.7, className }) => {
    const def = RX_ICON_PATHS[name];
    if (!def) return null;
    const nodes = style === 'filled' ? def.filled() : def.outline(strokeWidth);
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className}
           style={{ color, display: 'block', flexShrink: 0 }} aria-hidden="true">
        {nodes}
      </svg>
    );
  };

  Object.assign(window, { RX_ICON_KEYS, RX_ICON_LABELS, RX_ICON_PATHS, RxIcon });
})();

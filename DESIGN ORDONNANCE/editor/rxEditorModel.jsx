/* DocEase prescription editor — data model + defaults.

   Coordinates are stored in MILLIMETRES relative to the A4 page origin
   (top-left), so a saved config is resolution-independent and prints exactly.

   Element shape
   ─────────────
   {
     id, type, name, x, y, visible, locked, opacity, rotation,
     // text / contact
     bind, text, width, fontSize(pt), fontFamily, fontWeight, color,
     align, letterSpacing, lineHeight, uppercase, rtl,
     // contact only
     field, iconStyle, iconSize, iconColor, iconGap, showIcon,
     // logo
     src, w,
     // line
     length, thickness,
     // body
     w, h
   }

   Exports (window): RX_A4, RX_FONTS, RX_SWATCHES, RX_BINDS,
                     rxMakeElement, rxDefaultConfig, rxResolveText
*/
/* IIFE-SCOPED — every <script type="text/babel"> runs as a classic script and
   shares ONE global lexical scope, so bare top-level consts across these files
   would collide. The IIFE keeps internals private; the Object.assign(window, …)
   at the bottom is the only cross-file contract. */
(() => {
  const RX_A4 = { w: 210, h: 297, mmToPx: 3.7795275591 };

  const RX_FONTS = [
    { id: 'sans',   label: 'Inter · sans',   stack: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif" },
    { id: 'serif',  label: 'Georgia · serif', stack: "Georgia, 'Times New Roman', serif" },
    { id: 'mono',   label: 'Mono',            stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
    { id: 'arabic', label: 'Cairo · arabe',   stack: "Cairo, 'Noto Naskh Arabic', Tajawal, sans-serif" },
  ];

  const RX_SWATCHES = [
    '#1A6B8A', '#2ECC9A', '#0F172A', '#475569',
    '#E53E3E', '#F6AD55', '#6B3FD4', '#EC4B8C',
  ];

  /** Fields a text element can bind to on the doctor object. */
  const RX_BINDS = [
    { id: '',                    label: 'Texte libre' },
    { id: 'name',                label: 'Nom du médecin' },
    { id: 'speciality',          label: 'Spécialité' },
    { id: 'phone',               label: 'Téléphone' },
    { id: 'address',             label: 'Adresse' },
    { id: 'email',               label: 'E-mail' },
    { id: 'registrationNumber',  label: 'N° INPE' },
  ];

  let __seq = 0;
  const uid = (p) => `${p}-${Date.now().toString(36)}-${(__seq++).toString(36)}`;

  const BASE = {
    visible: true, locked: false, opacity: 1, rotation: 0,
  };

  const TEXT_BASE = {
    ...BASE, type: 'text', bind: '', text: 'Nouveau texte', width: 80,
    fontSize: 10, fontFamily: 'sans', fontWeight: 500, color: '#0F172A',
    align: 'left', letterSpacing: 0, lineHeight: 1.35, uppercase: false, rtl: false,
  };

  /** Factory for each element type. */
  function rxMakeElement(type, patch = {}) {
    switch (type) {
      case 'text':
        return { ...TEXT_BASE, id: uid('txt'), name: 'Texte', x: 20, y: 60, ...patch };
      case 'contact':
        return {
          ...BASE, id: uid('ctc'), type: 'contact', name: 'Contact',
          field: 'phone', bind: 'phone', text: '', x: 20, y: 250, width: 90,
          showIcon: true, iconStyle: 'outline', iconSize: 3.6, iconColor: '#1A6B8A', iconGap: 2.2,
          fontSize: 8, fontFamily: 'sans', fontWeight: 400, color: '#334155',
          align: 'left', letterSpacing: 0, lineHeight: 1.3, uppercase: false, rtl: false,
          ...patch,
        };
      case 'logo':
        return { ...BASE, id: uid('logo'), type: 'logo', name: 'Logo', x: 160, y: 14, w: 34, src: '', ...patch };
      case 'line':
        return { ...BASE, id: uid('line'), type: 'line', name: 'Filet', x: 18, y: 46, length: 174, thickness: 0.5, color: '#1A6B8A', ...patch };
      case 'icon':
        return { ...BASE, id: uid('ico'), type: 'icon', name: 'Icône', x: 20, y: 60, field: 'location', iconStyle: 'outline', iconSize: 6, iconColor: '#1A6B8A', ...patch };
      case 'body':
        return { ...BASE, id: uid('body'), type: 'body', name: 'Zone de prescription', x: 18, y: 96, w: 174, h: 150, locked: true, ...patch };
      default:
        return { ...TEXT_BASE, id: uid('txt'), name: 'Texte', x: 20, y: 60, ...patch };
    }
  }

  /** Resolve an element's display string against the doctor record. */
  function rxResolveText(el, doctor, opts = {}) {
    const ph = opts.placeholders !== false;
    if (el.bind) {
      const v = doctor ? doctor[el.bind] : '';
      if (v) return String(v);
      if (!ph) return '';
      const lbl = (RX_BINDS.find(b => b.id === el.bind) || {}).label || el.bind;
      return `[${lbl}]`;
    }
    return el.text || '';
  }

  /** A sensible starting letterhead. Every value is overridable in the editor. */
  function rxDefaultConfig() {
    return {
      version: 1,
      page: { size: 'A4', width: RX_A4.w, height: RX_A4.h, background: '#FFFFFF' },
      elements: [
        rxMakeElement('text', {
          name: 'Nom du médecin', bind: 'name', x: 18, y: 16, width: 110,
          fontSize: 17, fontWeight: 600, color: '#1A6B8A', lineHeight: 1.15,
        }),
        rxMakeElement('text', {
          name: 'Spécialité', bind: 'speciality', x: 18, y: 25, width: 110,
          fontSize: 9.5, fontWeight: 400, color: '#475569',
        }),
        rxMakeElement('text', {
          name: 'N° INPE', bind: 'registrationNumber', x: 18, y: 31, width: 110,
          fontSize: 8, fontWeight: 400, color: '#64748B',
        }),
        rxMakeElement('logo', { name: 'Logo du cabinet', x: 158, y: 13, w: 36 }),
        rxMakeElement('line', { name: 'Filet d’en-tête', x: 18, y: 44, length: 174, thickness: 0.6, color: '#1A6B8A' }),
        rxMakeElement('text', {
          name: 'Titre', text: 'ORDONNANCE', x: 18, y: 52, width: 174,
          fontSize: 12, fontWeight: 600, color: '#0F172A',
          align: 'center', letterSpacing: 3, uppercase: true,
        }),
        rxMakeElement('text', {
          name: 'Champs patient',
          text: 'Nom : ......................................................    Âge : ..........    Sexe : ..........    Date : ....................',
          x: 18, y: 66, width: 174, fontSize: 9, fontWeight: 400, color: '#334155', lineHeight: 1.6,
        }),
        rxMakeElement('body', { name: 'Zone de prescription', x: 18, y: 82, w: 174, h: 150 }),
        rxMakeElement('line', { name: 'Filet de pied', x: 18, y: 252, length: 174, thickness: 0.4, color: '#CBD5E0' }),
        rxMakeElement('contact', {
          name: 'Adresse', field: 'address', bind: 'address', x: 18, y: 258, width: 120,
          iconColor: '#1A6B8A', iconStyle: 'outline',
        }),
        rxMakeElement('contact', {
          name: 'Téléphone', field: 'phone', bind: 'phone', x: 18, y: 266, width: 90,
          iconColor: '#1A6B8A', iconStyle: 'outline',
        }),
        rxMakeElement('contact', {
          name: 'E-mail', field: 'mail', bind: 'email', x: 18, y: 274, width: 90,
          iconColor: '#1A6B8A', iconStyle: 'outline',
        }),
      ],
    };
  }

  Object.assign(window, {
    RX_A4, RX_FONTS, RX_SWATCHES, RX_BINDS,
    rxMakeElement, rxDefaultConfig, rxResolveText,
  });
})();

/* DocEase prescription editor — data model + defaults.
   Coordinates are stored in MILLIMETRES relative to the A4 page origin (top-left),
   so a saved config is resolution-independent and prints exactly.
*/

import { DoctorInfo } from '../../types';

export const RX_A4 = { w: 210, h: 297, mmToPx: 3.7795275591 };

export interface RxFont {
  id: 'sans' | 'serif' | 'mono' | 'arabic' | string;
  label: string;
  stack: string;
}

export const RX_FONTS: RxFont[] = [
  { id: 'sans', label: 'Inter · sans', stack: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'serif', label: 'Georgia · serif', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Mono', stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { id: 'arabic', label: 'Cairo · arabe', stack: "Cairo, 'Noto Naskh Arabic', Tajawal, sans-serif" },
];

export const RX_SWATCHES = [
  '#1A6B8A', '#2ECC9A', '#0F172A', '#475569',
  '#E53E3E', '#F6AD55', '#6B3FD4', '#EC4B8C',
];

export interface RxBindOption {
  id: string;
  label: string;
}

/** Fields a text element can bind to on the doctor object. */
export const RX_BINDS: RxBindOption[] = [
  { id: '', label: 'Texte libre' },
  { id: 'name', label: 'Nom du médecin' },
  { id: 'speciality', label: 'Spécialité' },
  { id: 'phone', label: 'Téléphone' },
  { id: 'address', label: 'Adresse' },
  { id: 'email', label: 'E-mail' },
  { id: 'registrationNumber', label: 'N° INPE' },
];

export type RxElementType = 'text' | 'contact' | 'logo' | 'line' | 'icon' | 'body';

export interface RxEditorElement {
  id: string;
  type: RxElementType;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  rotation?: number;

  // text / contact
  bind?: string;
  text?: string;
  width?: number;
  fontSize?: number; // pt
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
  uppercase?: boolean;
  rtl?: boolean;

  // contact / icon
  field?: string;
  iconStyle?: 'outline' | 'filled';
  iconSize?: number; // mm
  iconColor?: string;
  iconGap?: number; // mm
  showIcon?: boolean;

  // logo
  src?: string;
  w?: number; // mm

  // line
  length?: number; // mm
  thickness?: number; // mm

  // body
  h?: number; // mm
}

export interface RxLayoutConfig {
  version: number;
  page: {
    size: string;
    width: number;
    height: number;
    background: string;
  };
  elements: RxEditorElement[];
}

let __seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(__seq++).toString(36)}`;

const BASE: Omit<RxEditorElement, 'id' | 'type' | 'name' | 'x' | 'y'> = {
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
};

const TEXT_BASE: Omit<RxEditorElement, 'id' | 'name' | 'x' | 'y'> = {
  ...BASE,
  type: 'text',
  bind: '',
  text: 'Nouveau texte',
  width: 80,
  fontSize: 10,
  fontFamily: 'sans',
  fontWeight: 500,
  color: '#0F172A',
  align: 'left',
  letterSpacing: 0,
  lineHeight: 1.35,
  uppercase: false,
  rtl: false,
};

/** Factory for each element type. */
export function rxMakeElement(type: RxElementType, patch: Partial<RxEditorElement> = {}): RxEditorElement {
  switch (type) {
    case 'text':
      return { ...TEXT_BASE, id: uid('txt'), name: 'Texte', x: 20, y: 60, ...patch };
    case 'contact':
      return {
        ...BASE,
        id: uid('ctc'),
        type: 'contact',
        name: 'Contact',
        field: 'phone',
        bind: 'phone',
        text: '',
        x: 20,
        y: 250,
        width: 90,
        showIcon: true,
        iconStyle: 'outline',
        iconSize: 3.6,
        iconColor: '#1A6B8A',
        iconGap: 2.2,
        fontSize: 8,
        fontFamily: 'sans',
        fontWeight: 400,
        color: '#334155',
        align: 'left',
        letterSpacing: 0,
        lineHeight: 1.3,
        uppercase: false,
        rtl: false,
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
export function rxResolveText(
  el: RxEditorElement,
  doctor?: DoctorInfo | { [key: string]: any } | null,
  opts: { placeholders?: boolean } = {}
): string {
  const ph = opts.placeholders !== false;
  if (el.bind) {
    let v: any = '';
    if (doctor) {
      const d = doctor as any;
      if (el.bind === 'name') v = d.name || (d.nameFr ? `Dr. ${d.nameFr}` : '');
      else if (el.bind === 'speciality') v = d.speciality || d.specialtyFr || '';
      else if (el.bind === 'address') v = d.address || d.addressFr || '';
      else if (el.bind === 'registrationNumber') v = d.registrationNumber || d.inpe || d.ordreNumber || '';
      else v = d[el.bind];
    }
    if (v) return String(v);
    if (!ph) return '';
    const lbl = (RX_BINDS.find(b => b.id === el.bind) || {}).label || el.bind;
    return `[${lbl}]`;
  }
  return el.text || '';
}

/** A sensible starting letterhead. Every value is overridable in the editor. */
export function rxDefaultConfig(): RxLayoutConfig {
  return {
    version: 1,
    page: { size: 'A4', width: RX_A4.w, height: RX_A4.h, background: '#FFFFFF' },
    elements: [
      rxMakeElement('text', {
        name: 'Nom du médecin',
        bind: 'name',
        x: 18,
        y: 16,
        width: 110,
        fontSize: 17,
        fontWeight: 600,
        color: '#1A6B8A',
        lineHeight: 1.15,
      }),
      rxMakeElement('text', {
        name: 'Spécialité',
        bind: 'speciality',
        x: 18,
        y: 25,
        width: 110,
        fontSize: 9.5,
        fontWeight: 400,
        color: '#475569',
      }),
      rxMakeElement('text', {
        name: 'N° INPE',
        bind: 'registrationNumber',
        x: 18,
        y: 31,
        width: 110,
        fontSize: 8,
        fontWeight: 400,
        color: '#64748B',
      }),
      rxMakeElement('logo', { name: 'Logo du cabinet', x: 158, y: 13, w: 36 }),
      rxMakeElement('line', { name: 'Filet d’en-tête', x: 18, y: 44, length: 174, thickness: 0.6, color: '#1A6B8A' }),
      rxMakeElement('text', {
        name: 'Titre',
        text: 'ORDONNANCE',
        x: 18,
        y: 52,
        width: 174,
        fontSize: 12,
        fontWeight: 600,
        color: '#0F172A',
        align: 'center',
        letterSpacing: 3,
        uppercase: true,
      }),
      rxMakeElement('text', {
        name: 'Champs patient',
        text: 'Nom : ......................................................    Âge : ..........    Sexe : ..........    Date : ....................',
        x: 18,
        y: 66,
        width: 174,
        fontSize: 9,
        fontWeight: 400,
        color: '#334155',
        lineHeight: 1.6,
      }),
      rxMakeElement('body', { name: 'Zone de prescription', x: 18, y: 82, w: 174, h: 150 }),
      rxMakeElement('line', { name: 'Filet de pied', x: 18, y: 252, length: 174, thickness: 0.4, color: '#CBD5E0' }),
      rxMakeElement('contact', {
        name: 'Adresse',
        field: 'address',
        bind: 'address',
        x: 18,
        y: 258,
        width: 120,
        iconColor: '#1A6B8A',
        iconStyle: 'outline',
      }),
      rxMakeElement('contact', {
        name: 'Téléphone',
        field: 'phone',
        bind: 'phone',
        x: 18,
        y: 266,
        width: 90,
        iconColor: '#1A6B8A',
        iconStyle: 'outline',
      }),
      rxMakeElement('contact', {
        name: 'E-mail',
        field: 'mail',
        bind: 'email',
        x: 18,
        y: 274,
        width: 90,
        iconColor: '#1A6B8A',
        iconStyle: 'outline',
      }),
    ],
  };
}

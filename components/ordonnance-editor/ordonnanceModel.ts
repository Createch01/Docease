/* Ordonnance — appearance-driven prescription template + defaults.
   Every visual choice lives in `OrdonnanceAppearance`; doctor/patient/date/items
   stay pure data. This is the single source of truth the editor mutates and
   the printed document renders, in mm units so print output is exact.

   The default appearance IS the original DocEase "Style classique" (dark-navy
   badge, FR/AR header, red footer band). "Réinitialiser" returns to it.

   Stored in CustomTemplateConfig.ordonnance — older configs (without that key)
   are converted in memory by `fromLegacyConfig`, never overwritten.
*/

import type { CustomTemplateConfig, DoctorInfo } from '../../types';

export type PaperSize = 'A4' | 'A5';
export type Align3 = 'left' | 'center' | 'right';
export type Side = 'left' | 'right';
export type FooterField = 'address' | 'phone' | 'gsm' | 'email' | 'fax' | 'website';

export interface OrdonnanceAppearance {
  paperSize: PaperSize;
  fontFamily: 'serif' | 'sans' | 'arabic';
  margins: { horizontal: number; top: number; bottom: number };

  header: {
    bg: string; bgOpacity: number;
    name: { fontSize: number; color: string; align: Align3 };
    speciality: { show: boolean; fontSize: number };
    diplomas: { show: boolean };
    registration: { show: boolean };
    logo: {
      show: boolean; url: string; position: Align3; verticalAlign: 'top' | 'center' | 'bottom'; size: number;
      bgShow: boolean; bgColor: string; opacity: number;
    };
    arabic: { show: boolean; nameFontSize: number; specialityFontSize: number };
  };

  badge: {
    show: boolean; text: string; bg: string; color: string;
    fontSize: number; radius: number; paddingX: number; paddingY: number;
  };

  patientLine: { style: 'dotted' | 'dashed' | 'solid' | 'none'; showAge: boolean; showSex: boolean; showDate: boolean; showWeight: boolean };

  drugList: { style: 'bar' | 'simple' | 'bullet'; accentColor: string; itemGap: number };

  freeNotes: { show: boolean; text: string; fontSize: number };

  bodyLogo: { show: boolean; url: string; size: number; opacity: number };

  footer: {
    bg: string; textColor: string; layout: 'row' | 'stacked'; fontSize: number;
    show: Record<FooterField, boolean>;
    showIcons: boolean;
    icons: {
      style: 'outline' | 'filled'; size: number; strokeWidth: number; color: string;
      badge: boolean; badgeBg: string; badgeColor: string;
      map: Record<FooterField, string>;
    };
    arabic: { show: boolean };
  };

  qr: { show: boolean; size: number; value: string; position: Side };
  barcode: { show: boolean; size: number; value: string; position: Side };
  watermark: { show: boolean; type: 'image' | 'text'; text: string; opacity: number; size: number; position: 'center' | 'top-left' | 'bottom-right' };

  /* Empty zone above the footer for the handwritten signature + stamp.
     No image upload — the doctor signs and stamps the printed sheet. */
  signatureZone: { show: boolean; label: string; position: Side; width: number; height: number };
}

/* Doctor data as the template reads it — adapted from DoctorInfo. */
export interface OrdDoctor {
  name: string;
  speciality: string;
  diplomasFr: string;
  nameAr: string;
  specialityAr: string;
  diplomasAr: string;
  addressFr: string;
  addressAr: string;
  phone: string;
  gsm: string;
  fax: string;
  website: string;
  email: string;
  registrationNumber: string;
  inpe: string;
  ice: string;
  taxId: string;
  logoUrl: string;
}

export interface OrdPatient { name?: string; age?: string | number; sex?: string; weight?: string }

export interface OrdItem {
  drugName: string;
  strength?: string;
  form?: string;
  dosage?: string;
  duration?: string;
  timing?: string;
}

export const ORD_PAGE: Record<PaperSize, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 } };

export const ORD_FONTS: Record<OrdonnanceAppearance['fontFamily'], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  arabic: "Cairo, 'Noto Naskh Arabic', Tajawal, sans-serif",
};

export interface OrdTheme { id: string; label: string; badge: string; accent: string; footerBg: string; footerText: string; nameColor: string }

/* Quick-apply color themes — same structure, different hue. Picking one sets
   several fields at once; every field stays individually editable afterwards. */
export const ORD_THEMES: OrdTheme[] = [
  { id: 'classique', label: 'Classique', badge: '#12496B', accent: '#12496B', footerBg: '#E53E3E', footerText: '#FFFFFF', nameColor: '#0B2A5B' },
  { id: 'emeraude', label: 'Émeraude', badge: '#0F6E5C', accent: '#0F6E5C', footerBg: '#0F6E5C', footerText: '#FFFFFF', nameColor: '#0B4D3F' },
  { id: 'ardoise', label: 'Ardoise', badge: '#4A5568', accent: '#4A5568', footerBg: '#2D3748', footerText: '#FFFFFF', nameColor: '#2D3748' },
  { id: 'bordeaux', label: 'Bordeaux', badge: '#7B2D3B', accent: '#7B2D3B', footerBg: '#7B2D3B', footerText: '#FFFFFF', nameColor: '#5C1F2B' },
];

export function ordDefaultAppearance(): OrdonnanceAppearance {
  return {
    paperSize: 'A4',
    fontFamily: 'serif',
    margins: { horizontal: 10, top: 9, bottom: 8 },

    header: {
      bg: '#FFFFFF', bgOpacity: 1,
      name: { fontSize: 24, color: '#0B2A5B', align: 'left' },
      speciality: { show: true, fontSize: 10.5 },
      diplomas: { show: true },
      registration: { show: false },
      logo: {
        show: true, url: '', position: 'left', verticalAlign: 'center', size: 64,
        bgShow: false, bgColor: '#F0F4F8', opacity: 1,
      },
      arabic: { show: true, nameFontSize: 17, specialityFontSize: 10.5 },
    },

    badge: {
      show: true,
      text: 'ORDONNANCE', bg: '#12496B', color: '#FFFFFF',
      fontSize: 14, radius: 999, paddingX: 26, paddingY: 11,
    },

    patientLine: { style: 'dotted', showAge: true, showSex: true, showDate: true, showWeight: false },

    drugList: { style: 'bar', accentColor: '#12496B', itemGap: 10 },

    freeNotes: { show: false, text: '', fontSize: 9.5 },

    bodyLogo: { show: false, url: '', size: 140, opacity: 0.12 },

    footer: {
      bg: '#E53E3E', textColor: '#FFFFFF', layout: 'row',
      fontSize: 8,
      show: { address: true, phone: true, gsm: true, email: true, fax: false, website: false },
      showIcons: true,
      icons: {
        style: 'outline', size: 9, strokeWidth: 2, color: '', badge: false, badgeBg: '#FFFFFF', badgeColor: '',
        map: { address: 'location', phone: 'phone', gsm: 'cellphone', email: 'mail', fax: 'fax', website: 'website' },
      },
      arabic: { show: true },
    },

    qr: { show: false, size: 50, value: '', position: 'left' },
    barcode: { show: false, size: 50, value: '', position: 'right' },
    watermark: { show: false, type: 'image', text: '', opacity: 0.05, size: 180, position: 'center' },

    signatureZone: { show: true, label: 'Signature et cachet', position: 'right', width: 60, height: 26 },
  };
}

/* Fills any key missing from `saved` with the default — keeps configs saved by
   an older version loadable as the model grows. */
export function deepMergeDefaults<T>(base: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
  const src = saved as Record<string, unknown>;
  const out = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    if (src[k] === undefined) continue;
    const b = out[k];
    out[k] = (b && typeof b === 'object' && !Array.isArray(b)) ? deepMergeDefaults(b, src[k]) : src[k];
  }
  return out as T;
}

/* Immutable set by dotted path, e.g. setPath(a, 'footer.icons.map.phone', 'cellphone'). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const next = { ...(obj as Record<string, unknown>) };
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = { ...(cur[k] as Record<string, unknown>) };
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return next as T;
}

/* Converts a CustomTemplateConfig saved by the previous "Mon design" editor
   into the new appearance. In memory only — the stored config is untouched.
   Read as a loose record: configs saved by different past versions carry
   different subsets of these keys. */
export function fromLegacyConfig(raw: object): OrdonnanceAppearance {
  const a = ordDefaultAppearance();
  const c = raw as Record<string, unknown>;
  const pick = <V,>(v: unknown, d: V): V => (v === undefined || v === null ? d : v as V);

  a.header.bg = pick(c.headerColor, a.header.bg);
  a.header.bgOpacity = pick(c.headerBgOpacity, a.header.bgOpacity);
  a.header.name.fontSize = pick(c.nameFontSize, a.header.name.fontSize);
  a.header.name.color = pick(c.nameColor, a.header.name.color);
  a.header.name.align = pick(c.namePosition, a.header.name.align);
  a.header.speciality.show = pick(c.showSpeciality, a.header.speciality.show);
  a.header.speciality.fontSize = pick(c.specialityFontSize, a.header.speciality.fontSize);
  a.header.diplomas.show = pick(c.showDiplomas, a.header.diplomas.show);
  a.header.registration.show = pick(c.showOrdreNumber, a.header.registration.show);
  a.header.logo.show = pick(c.showLogo, a.header.logo.show);
  a.header.logo.url = (c.logoUrl as string) || '';
  a.header.logo.position = pick(c.logoPosition, a.header.logo.position);
  a.header.logo.verticalAlign = pick(c.logoVerticalAlign, a.header.logo.verticalAlign);
  a.header.logo.size = pick(c.logoSize, a.header.logo.size);
  a.header.logo.bgColor = pick(c.logoBg, a.header.logo.bgColor);
  a.header.logo.bgShow = Number(c.logoBgOpacity ?? 0) > 0;
  if (c.showArabicName !== undefined || c.showArabicSpeciality !== undefined) {
    a.header.arabic.show = !!(c.showArabicName || c.showArabicSpeciality);
  }
  a.header.arabic.nameFontSize = pick(c.arabicNameFontSize, a.header.arabic.nameFontSize);
  a.header.arabic.specialityFontSize = pick(c.arabicSpecialityFontSize, a.header.arabic.specialityFontSize);

  a.badge.text = pick(c.badgeText, a.badge.text);
  a.badge.bg = pick(c.badgeBg, a.badge.bg);
  a.badge.color = pick(c.badgeColor, a.badge.color);
  a.badge.fontSize = pick(c.badgeFontSize, a.badge.fontSize);
  a.badge.radius = pick(c.badgeRadius, a.badge.radius);

  a.patientLine.style = pick(c.patientLineStyle, a.patientLine.style);
  a.drugList.style = c.drugListStyle === 'simple' ? 'simple' : c.drugListStyle === 'puces' ? 'bullet' : 'bar';
  a.drugList.accentColor = pick(c.accentColor, a.drugList.accentColor);
  a.fontFamily = c.fontFamily === 'serif' ? 'serif' : c.fontFamily ? 'sans' : a.fontFamily;

  a.footer.bg = pick(c.footerBg, a.footer.bg);
  a.footer.textColor = pick(c.footerTextColor, a.footer.textColor);
  a.footer.show.phone = pick(c.showFooterPhone, a.footer.show.phone);
  a.footer.show.email = pick(c.showFooterEmail, a.footer.show.email);
  a.footer.show.address = pick(c.showFooterAddress, a.footer.show.address);
  a.footer.show.fax = pick(c.showFooterFax, a.footer.show.fax);
  a.footer.arabic.show = pick(c.showFooterArabicAddress, a.footer.arabic.show);

  a.qr.show = pick(c.enableQrCode, a.qr.show);
  a.qr.position = pick(c.qrCodePosition, a.qr.position);
  a.qr.value = pick(c.qrCodeContent, a.qr.value);

  if (c.watermark && c.watermark !== 'none') {
    a.watermark.show = true;
    a.watermark.type = 'text';
  }
  a.watermark.opacity = Math.min(0.1, pick(c.watermarkOpacity, a.watermark.opacity));

  a.bodyLogo.show = pick(c.showBodyLogo, a.bodyLogo.show);
  a.bodyLogo.url = (c.bodyLogoUrl as string) || '';
  a.bodyLogo.size = pick(c.bodyLogoSize, a.bodyLogo.size);
  a.bodyLogo.opacity = pick(c.bodyLogoOpacity, a.bodyLogo.opacity);

  if (c.showStamp !== undefined || c.showSignature !== undefined) {
    a.signatureZone.show = !!(c.showStamp || c.showSignature);
  }
  a.signatureZone.position = pick(c.stampPosition, a.signatureZone.position);
  return a;
}

/* Resolves the appearance to render for a stored config:
   new format → merged with defaults; old format → converted; nothing → defaults. */
export function resolveOrdonnanceAppearance(config?: Partial<CustomTemplateConfig> | null): OrdonnanceAppearance {
  if (config?.ordonnance) return deepMergeDefaults(ordDefaultAppearance(), config.ordonnance);
  if (config && Object.keys(config).length > 0) return fromLegacyConfig(config);
  return ordDefaultAppearance();
}

/* DoctorInfo (profil + cabinet) → template doctor. */
export function toOrdDoctor(d: DoctorInfo, website?: string): OrdDoctor {
  return {
    name: d.nameFr || '',
    speciality: d.specialtyFr || '',
    diplomasFr: d.diplomasFr || '',
    nameAr: d.nameAr || '',
    specialityAr: d.specialtyAr || '',
    diplomasAr: d.diplomasAr || '',
    addressFr: d.addressFr || '',
    addressAr: d.addressAr || '',
    phone: d.phone || '',
    gsm: d.gsm || '',
    fax: d.fax || '',
    // DoctorInfo.website (Cabinet) ; l'ancien appearance.website reste le secours.
    website: d.website || website || '',
    email: d.email || '',
    registrationNumber: d.ordreNumber || '',
    inpe: d.inpe || '',
    ice: d.ice || '',
    taxId: d.taxId || '',
    logoUrl: d.logoUrl || '',
  };
}

export * from './RxShared';
export { default as Template01OrangeCurve } from './Template01OrangeCurve';
export { default as Template02NavyCaduceus } from './Template02NavyCaduceus';
export { default as Template03PurpleHeart } from './Template03PurpleHeart';
export { default as Template04PastelProfile } from './Template04PastelProfile';
export { default as Template05RedEcg } from './Template05RedEcg';
export { default as Template06PinkArc } from './Template06PinkArc';
export { default as Template07BlueBandClinic } from './Template07BlueBandClinic';
export { default as Template08BlueWaveCare } from './Template08BlueWaveCare';
export { default as Template09BlueGradientCorner } from './Template09BlueGradientCorner';

import Template01OrangeCurve from './Template01OrangeCurve';
import Template02NavyCaduceus from './Template02NavyCaduceus';
import Template03PurpleHeart from './Template03PurpleHeart';
import Template04PastelProfile from './Template04PastelProfile';
import Template05RedEcg from './Template05RedEcg';
import Template06PinkArc from './Template06PinkArc';
import Template07BlueBandClinic from './Template07BlueBandClinic';
import Template08BlueWaveCare from './Template08BlueWaveCare';
import Template09BlueGradientCorner from './Template09BlueGradientCorner';
import type { RxTemplateProps } from './RxShared';

export interface RxTemplateMeta {
  id: string;
  label: string;
  /** Dominant accent, for swatches in a picker UI. */
  accent: string;
  component: React.FC<RxTemplateProps>;
  /** True when the original design featured a photograph (photoUrl prop). */
  supportsPhoto?: boolean;
}

export const RX_TEMPLATES: RxTemplateMeta[] = [
  { id: 'orange-curve',    label: 'Courbe orange',      accent: '#F0651F', component: Template01OrangeCurve, supportsPhoto: true },
  { id: 'navy-caduceus',   label: 'Caducée marine',     accent: '#0B2A5B', component: Template02NavyCaduceus },
  { id: 'purple-heart',    label: 'Cœur violet',        accent: '#6B3FD4', component: Template03PurpleHeart },
  { id: 'pastel-profile',  label: 'Profil pastel',      accent: '#F2A3B3', component: Template04PastelProfile },
  { id: 'red-ecg',         label: 'ECG rouge',          accent: '#ED1C24', component: Template05RedEcg },
  { id: 'pink-arc',        label: 'Arc rose',           accent: '#EC4B8C', component: Template06PinkArc, supportsPhoto: true },
  { id: 'blue-band',       label: 'Bandeau bleu',       accent: '#1B4F9C', component: Template07BlueBandClinic },
  { id: 'blue-wave',       label: 'Vague bleue',        accent: '#1C7BC0', component: Template08BlueWaveCare, supportsPhoto: true },
  { id: 'blue-corner',     label: 'Angle dégradé',      accent: '#1565C0', component: Template09BlueGradientCorner },
];

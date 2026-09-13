/**
 * CustomTemplateEditor.tsx — from-scratch visual ordonnance design editor.
 * Fully isolated from the 9 built-in Claude Design templates: it owns its
 * own 2-column layout (340px controls + live A4 preview) and only talks to
 * the rest of the app through props (doctor info in, CustomTemplateConfig out).
 */

import React, { useRef, useState } from 'react';
import {
  Upload, Trash2, RefreshCw, ChevronDown, ChevronLeft, Save,
  Phone, Mail, MapPin, ShieldCheck, Globe, LayoutGrid, Palette,
  QrCode, User, PenTool, Droplet,
} from 'lucide-react';
import { CustomTemplateConfig, DoctorInfo } from '../types';
import TemplateRenderer from './templates/TemplateRenderer';
import { DEFAULT_CUSTOM_TEMPLATE_CONFIG } from './templates/CustomTemplate';

const PREVIEW_PATIENT = { name: 'M. Ahmed Benali', age: 45, sex: 'M' };
const PREVIEW_ITEMS = [
  { id: 'p1', medicineName: 'AMLOR', strength: '5MG', dosage: '1-0-0', duration: '30 jours', timing: 'Après repas' as const },
  { id: 'p2', medicineName: 'KARDEGIC', strength: '75MG', dosage: '1-0-0', duration: '30 jours', timing: 'Après repas' as const },
];

const HEADER_COLOR_PRESETS = ['#0d9488', '#1e3a5f', '#7c1d2e', '#2d6a4f', '#374151', '#111827'];

const input40 = 'w-full h-10 px-3 rounded-md border text-[13px] outline-none transition-all bg-white';
const inputStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text)' } as React.CSSProperties;
const sectionLabel = 'text-[11px] font-medium mb-2 block';

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const AccordionItem: React.FC<{
  title: string; icon: React.ReactNode; isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}> = ({ title, icon, isOpen, onToggle, children }) => (
  <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left transition-colors"
      style={{ background: isOpen ? 'var(--color-surface-alt)' : 'white' }}
    >
      <span className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: 'var(--color-text)' }}>
        {icon} {title}
      </span>
      <ChevronDown size={14} style={{ color: 'var(--color-text-subtle)', transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
    </button>
    {isOpen && <div className="px-3.5 py-4 space-y-4 border-t" style={{ borderColor: 'var(--color-border)' }}>{children}</div>}
  </div>
);

const ToggleRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between">
    <label className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>{label}</label>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-10 h-[22px] rounded-full transition-colors relative"
      style={{ background: checked ? 'var(--color-primary)' : 'var(--color-border-strong)' }}
    >
      <div className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all" style={{ left: checked ? '20px' : '2px' }} />
    </button>
  </div>
);

const SegButtons = <T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) => (
  <div className="flex rounded-md p-1" style={{ background: 'var(--color-border)' }}>
    {options.map(opt => (
      <button
        key={opt.id}
        type="button"
        onClick={() => onChange(opt.id)}
        className="flex-1 py-1.5 rounded text-[10.5px] font-medium transition-all"
        style={value === opt.id ? { background: 'white', color: 'var(--color-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--color-text-subtle)' }}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const UploadSlot: React.FC<{ label: string; url?: string | null; onPick: () => void; onClear: () => void }> = ({ label, url, onPick, onClear }) => (
  <div className="space-y-1.5">
    <div
      className="w-full aspect-square bg-white rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer relative group"
      style={{ borderColor: 'var(--color-border-strong)' }}
      onClick={onPick}
    >
      {url ? (
        <>
          <img src={url} alt={label} className="w-full h-full object-contain p-1.5" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <RefreshCw className="text-white" size={14} />
          </div>
        </>
      ) : (
        <Upload size={16} style={{ color: 'var(--color-text-faint)' }} />
      )}
    </div>
    <span className="text-[9.5px] font-medium block text-center" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
    {url && (
      <button type="button" onClick={onClear} className="w-full flex justify-center" style={{ color: 'var(--color-danger)' }}>
        <Trash2 size={11} />
      </button>
    )}
  </div>
);

interface CustomTemplateEditorProps {
  doctor: DoctorInfo;
  initialConfig?: CustomTemplateConfig;
  onSave: (config: CustomTemplateConfig) => void;
  onCancel?: () => void;
}

const CustomTemplateEditor: React.FC<CustomTemplateEditorProps> = ({ doctor, initialConfig, onSave, onCancel }) => {
  const [config, setConfig] = useState<CustomTemplateConfig>(initialConfig || DEFAULT_CUSTOM_TEMPLATE_CONFIG);
  const [openSection, setOpenSection] = useState('header');
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CustomTemplateConfig>(key: K, value: CustomTemplateConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  React.useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const MM_TO_PX = 96 / 25.4;
    const A4_W = 210 * MM_TO_PX;
    const A4_H = 297 * MM_TO_PX;
    const update = () => {
      const availH = el.clientHeight - 48;
      const availW = el.clientWidth - 48;
      if (availH <= 0 || availW <= 0) return;
      setScale(Math.max(0.2, Math.min(availH / A4_H, availW / A4_W, 0.95)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: 'logoUrl' | 'stampUrl' | 'signatureUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image trop volumineuse (max 2 Mo).'); return; }
    try {
      const base64 = await fileToBase64(file);
      set(key, base64);
    } catch {
      alert("Erreur lors du chargement de l'image");
    }
  };

  const previewDoctor: DoctorInfo = { ...doctor };

  return (
    <div className="flex gap-5 animate-in" style={{ height: '100%', minWidth: 'min-content' }}>
      {/* ── Left: 340px control panel ── */}
      <div
        className="w-[340px] shrink-0 flex flex-col rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
      >
        <div className="px-4 py-3.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-surface-alt)]"
              style={{ color: 'var(--color-text-muted)' }}
              title="Retour"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div>
            <h3 className="text-[14.5px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Mon design personnalisé</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Créez votre propre ordonnance.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 space-y-2.5">

          {/* ── En-tête ── */}
          <AccordionItem title="En-tête" icon={<LayoutGrid size={13} />} isOpen={openSection === 'header'} onToggle={() => setOpenSection(s => s === 'header' ? '' : 'header')}>
            <div>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}>Logo</span>
              <div className="grid grid-cols-3 gap-2.5">
                <UploadSlot label="Logo" url={config.logoUrl} onPick={() => logoInputRef.current?.click()} onClear={() => set('logoUrl', null)} />
              </div>
              <input type="file" ref={logoInputRef} onChange={e => handleUpload(e, 'logoUrl')} className="hidden" accept="image/png,image/jpeg" />
              <div className="mt-2.5">
                <span className="text-[10.5px] font-medium mb-1 block" style={{ color: 'var(--color-text-subtle)' }}>Position</span>
                <SegButtons options={[{ id: 'left', label: 'Gauche' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Droite' }]} value={config.logoPosition} onChange={v => set('logoPosition', v)} />
              </div>
              <div className="mt-2.5">
                <div className="flex justify-between mb-1">
                  <span className="text-[10.5px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Taille</span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{config.logoSize}px</span>
                </div>
                <input type="range" min={40} max={150} step={5} value={config.logoSize} onChange={e => set('logoSize', parseInt(e.target.value))} className="w-full h-1.5 rounded-lg cursor-pointer" style={{ accentColor: 'var(--color-primary)' }} />
              </div>
            </div>

            <div className="pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <ToggleRow label="Afficher le nom du médecin" checked={config.showName} onChange={v => set('showName', v)} />
              {config.showName && (
                <div className="mt-2.5 space-y-2.5">
                  <SegButtons options={[{ id: 'left', label: 'Gauche' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Droite' }]} value={config.namePosition} onChange={v => set('namePosition', v)} />
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10.5px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Taille du texte</span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{config.nameFontSize}px</span>
                    </div>
                    <input type="range" min={14} max={28} value={config.nameFontSize} onChange={e => set('nameFontSize', parseInt(e.target.value))} className="w-full h-1.5 rounded-lg cursor-pointer" style={{ accentColor: 'var(--color-primary)' }} />
                  </div>
                </div>
              )}
            </div>

            <ToggleRow label="Afficher la spécialité" checked={config.showSpeciality} onChange={v => set('showSpeciality', v)} />

            <div className="pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}>Couleur de l'en-tête</span>
              <div className="flex flex-wrap items-center gap-2">
                {HEADER_COLOR_PRESETS.map(hex => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => set('headerColor', hex)}
                    className="w-7 h-7 rounded-full border-2 transition-all shrink-0"
                    style={{ background: hex, borderColor: config.headerColor.toLowerCase() === hex ? 'var(--color-primary)' : 'transparent', boxShadow: config.headerColor.toLowerCase() === hex ? '0 0 0 2px white, 0 0 0 4px var(--color-primary-200)' : 'var(--shadow-xs)' }}
                  />
                ))}
                <div className="relative w-7 h-7 rounded-full border-2 shrink-0 overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
                  <input type="color" value={config.headerColor} onChange={e => set('headerColor', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
            </div>

            <div>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}>Style en-tête</span>
              <div className="grid grid-cols-1 gap-2">
                {([
                  { id: 'minimal', label: 'Minimaliste', hint: 'Juste texte + ligne' },
                  { id: 'bande', label: 'Bande colorée', hint: 'Fond coloré en haut' },
                  { id: 'encadre', label: 'Encadré', hint: 'Logo dans une boîte + texte' },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => set('headerStyle', opt.id)}
                    className="flex flex-col items-start gap-0.5 p-2.5 rounded-lg border text-left transition-all"
                    style={config.headerStyle === opt.id
                      ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', color: 'var(--color-primary)' }
                      : { background: 'white', borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
                  >
                    <span className="text-[11.5px] font-semibold">{opt.label}</span>
                    <span className="text-[9.5px] leading-snug" style={{ opacity: 0.85 }}>{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </AccordionItem>

          {/* ── Informations affichées ── */}
          <AccordionItem title="Informations affichées" icon={<User size={13} />} isOpen={openSection === 'infos'} onToggle={() => setOpenSection(s => s === 'infos' ? '' : 'infos')}>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5"><Phone size={13} style={{ color: 'var(--color-text-faint)' }} /><div className="flex-1"><ToggleRow label="Téléphone" checked={config.showPhone} onChange={v => set('showPhone', v)} /></div></div>
              <div className="flex items-center gap-2.5"><Mail size={13} style={{ color: 'var(--color-text-faint)' }} /><div className="flex-1"><ToggleRow label="Email" checked={config.showEmail} onChange={v => set('showEmail', v)} /></div></div>
              <div className="flex items-center gap-2.5"><MapPin size={13} style={{ color: 'var(--color-text-faint)' }} /><div className="flex-1"><ToggleRow label="Adresse" checked={config.showAddress} onChange={v => set('showAddress', v)} /></div></div>
              <div className="flex items-center gap-2.5"><ShieldCheck size={13} style={{ color: 'var(--color-text-faint)' }} /><div className="flex-1"><ToggleRow label="N° Ordre National des Médecins" checked={config.showOrdreNumber} onChange={v => set('showOrdreNumber', v)} /></div></div>
              <div className="flex items-center gap-2.5"><Globe size={13} style={{ color: 'var(--color-text-faint)' }} /><div className="flex-1"><ToggleRow label="Site web" checked={config.showWebsite} onChange={v => set('showWebsite', v)} /></div></div>
              {config.showWebsite && (
                <input type="text" value={config.website || ''} onChange={e => set('website', e.target.value)} className={input40} style={inputStyle} placeholder="www.cabinet-exemple.ma" />
              )}
            </div>
          </AccordionItem>

          {/* ── Corps de l'ordonnance ── */}
          <AccordionItem title="Corps de l'ordonnance" icon={<Palette size={13} />} isOpen={openSection === 'corps'} onToggle={() => setOpenSection(s => s === 'corps' ? '' : 'corps')}>
            <div>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}>Style liste médicaments</span>
              <div className="grid grid-cols-1 gap-2">
                {([
                  { id: 'barre', label: 'Numéroté avec barre colorée' },
                  { id: 'simple', label: 'Numéroté simple' },
                  { id: 'puces', label: 'Avec puces rondes' },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => set('drugListStyle', opt.id)}
                    className="p-2.5 rounded-lg border text-left text-[11.5px] font-medium transition-all"
                    style={config.drugListStyle === opt.id
                      ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', color: 'var(--color-primary)' }
                      : { background: 'white', borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}>Couleur accent médicaments</span>
              <div className="flex items-center gap-2">
                <div className="relative w-7 h-7 rounded-full border-2 shrink-0 overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="absolute inset-0" style={{ background: config.accentColor }} />
                  <input type="color" value={config.accentColor} onChange={e => set('accentColor', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <button type="button" onClick={() => set('accentColor', config.headerColor)} className="text-[10.5px] font-medium underline decoration-dotted" style={{ color: 'var(--color-text-subtle)' }}>
                  Utiliser la couleur de l'en-tête
                </button>
              </div>
            </div>
            <div>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}>Police</span>
              <select value={config.fontFamily} onChange={e => set('fontFamily', e.target.value as CustomTemplateConfig['fontFamily'])} className={input40} style={inputStyle}>
                <option value="serif">Sérif (Médical)</option>
                <option value="sans">Sans-Sérif (Moderne)</option>
                <option value="mono">Monospace (Technique)</option>
              </select>
            </div>
          </AccordionItem>

          {/* ── Pied de page ── */}
          <AccordionItem title="Pied de page" icon={<PenTool size={13} />} isOpen={openSection === 'footer'} onToggle={() => setOpenSection(s => s === 'footer' ? '' : 'footer')}>
            <div>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}>Style pied de page</span>
              <div className="grid grid-cols-1 gap-2">
                {([
                  { id: 'simple', label: 'Simple', hint: 'Ligne + texte' },
                  { id: 'bande', label: 'Bande colorée', hint: '' },
                  { id: 'vague', label: 'Vague SVG', hint: 'Teal par défaut' },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => set('footerStyle', opt.id)}
                    className="flex flex-col items-start gap-0.5 p-2.5 rounded-lg border text-left transition-all"
                    style={config.footerStyle === opt.id
                      ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', color: 'var(--color-primary)' }
                      : { background: 'white', borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
                  >
                    <span className="text-[11.5px] font-semibold">{opt.label}</span>
                    {opt.hint && <span className="text-[9.5px] leading-snug" style={{ opacity: 0.85 }}>{opt.hint}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-1 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
              <ToggleRow label="Afficher cachet & signature" checked={config.showStamp || config.showSignature} onChange={v => { set('showStamp', v); set('showSignature', v); }} />
              {(config.showStamp || config.showSignature) && (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <UploadSlot label="Cachet" url={config.stampUrl} onPick={() => stampInputRef.current?.click()} onClear={() => set('stampUrl', null)} />
                    <UploadSlot label="Signature" url={config.signatureUrl} onPick={() => signatureInputRef.current?.click()} onClear={() => set('signatureUrl', null)} />
                  </div>
                  <input type="file" ref={stampInputRef} onChange={e => handleUpload(e, 'stampUrl')} className="hidden" accept="image/png,image/jpeg" />
                  <input type="file" ref={signatureInputRef} onChange={e => handleUpload(e, 'signatureUrl')} className="hidden" accept="image/png,image/jpeg" />
                  <SegButtons options={[{ id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' }]} value={config.stampPosition} onChange={v => set('stampPosition', v)} />
                </>
              )}
            </div>

            <div className="pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <ToggleRow label="QR Code" checked={config.enableQrCode} onChange={v => set('enableQrCode', v)} />
              {config.enableQrCode && (
                <div className="mt-2.5 space-y-2.5">
                  <SegButtons options={[{ id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' }]} value={config.qrCodePosition} onChange={v => set('qrCodePosition', v)} />
                  <input type="text" value={config.qrCodeContent} onChange={e => set('qrCodeContent', e.target.value)} className={input40} style={inputStyle} placeholder="Lien Maps / WhatsApp / site web" />
                </div>
              )}
            </div>

            <div className="pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <span className={sectionLabel} style={{ color: 'var(--color-text)' }}><Droplet size={12} className="inline mr-1 -mt-0.5" />Filigrane</span>
              <SegButtons options={[{ id: 'none', label: 'Aucun' }, { id: 'initials', label: 'Initiales' }, { id: 'cross', label: 'Croix' }]} value={config.watermark} onChange={v => set('watermark', v)} />
              {config.watermark !== 'none' && (
                <div className="mt-2.5">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10.5px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Opacité</span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{Math.round(config.watermarkOpacity * 100)}%</span>
                  </div>
                  <input type="range" min={2} max={8} value={Math.round(config.watermarkOpacity * 100)} onChange={e => set('watermarkOpacity', parseInt(e.target.value) / 100)} className="w-full h-1.5 rounded-lg cursor-pointer" style={{ accentColor: 'var(--color-primary)' }} />
                </div>
              )}
            </div>
          </AccordionItem>
        </div>

        {/* Sticky action bar */}
        <div className="px-3.5 py-3 border-t space-y-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <button
            type="button"
            onClick={() => onSave(config)}
            className="w-full h-9 px-4 rounded-lg text-[12.5px] font-medium flex items-center justify-center gap-2 text-white transition-all shadow-soft hover:shadow-card active:scale-[0.98]"
            style={{ background: 'var(--color-primary)' }}
          >
            <Save size={14} /> Utiliser ce design
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full h-9 px-4 rounded-lg text-[12.5px] font-medium flex items-center justify-center gap-2 transition-all border hover:bg-[var(--color-surface-alt)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              Annuler
            </button>
          )}
        </div>
      </div>

      {/* ── Right: live A4 preview ── */}
      <div className="flex-1 flex flex-col rounded-xl border overflow-hidden" style={{ background: '#f0f0f0', borderColor: 'var(--color-border)', minWidth: '360px' }}>
        <div ref={previewRef} className="flex-1 flex items-center justify-center overflow-auto p-6">
          <div style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)', flexShrink: 0 }}>
            <TemplateRenderer
              templateId="custom"
              doctor={previewDoctor}
              appearance={{
                primaryColor: config.accentColor,
                fontSize: 'medium',
                logoScale: 1,
                fontFamily: config.fontFamily,
                headerLayout: 'classic',
                watermarkOpacity: config.watermarkOpacity,
                showBorder: true,
                footerColor: config.headerColor,
                selectedTemplate: 'custom',
                customTemplateConfig: config,
              }}
              patient={{ name: PREVIEW_PATIENT.name, age: PREVIEW_PATIENT.age, sex: PREVIEW_PATIENT.sex, type: 'Adult' }}
              items={PREVIEW_ITEMS}
              date={new Date().toLocaleDateString('fr-FR')}
              scale={scale}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomTemplateEditor;

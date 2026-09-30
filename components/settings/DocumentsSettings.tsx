import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, FileStack, FileText, Globe, Image as ImageIcon, Monitor, Pencil, Phone, QrCode, User } from 'lucide-react';
import { PrescriptionAppearance, PrescriptionItem } from '../../types';
import { dataService } from '../../services/dataService';
import { settingsService } from '../../services/settingsService';
import { toastService } from '../../services/toastService';
import CombinedConsultationTemplate from '../CombinedConsultationTemplate';
import { OrdonnanceEditorApp, OrdonnanceSaveResult, OrdonnanceEditorHandle } from '../ordonnance-editor';
import { PRESCRIPTION_TEMPLATE_META, TemplateThumbnail, PrescriptionTemplateId } from '../templates/TemplateRenderer';
import { normalizeRoute } from './settingsRoutes';
import {
  SettingsPageFrame, SettingsCard, SettingsLink, Segmented, Toggle,
  input40, inputStyle, labelEyebrow, labelEyebrowStyle, fieldsDiffer, pickFields,
} from './SettingsUI';
import { useUnsavedChanges } from './unsavedChanges';
import { SettingsPageProps } from './ProfileSettings';

const DocumentsSettings: React.FC<SettingsPageProps> = (props) => {
  const tab = normalizeRoute(props.route).tab;
  if (tab === 'design') return <DesignTab {...props} />;
  if (tab === 'impression') return <PrintTab {...props} />;
  return <TemplatesTab {...props} />;
};

// ═══════════ Modèles ═══════════
const TemplatesTab: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const doctor = useMemo(() => dataService.getDoctorInfo(), []);
  const [active, setActive] = useState<PrescriptionTemplateId>(() => settingsService.getAppearance().selectedTemplate || 'letterhead_simple');
  const [pending, setPending] = useState<PrescriptionTemplateId>(active);
  const hasCustomDesign = useMemo(() => !!settingsService.getAppearance().customTemplateConfig, []);
  const dirty = pending !== active;
  useUnsavedChanges('documents/modeles', dirty);

  // Le doctor choisit une carte puis confirme, pour qu'un clic égaré n'écrase
  // jamais silencieusement le modèle utilisé.
  const apply = () => {
    settingsService.saveAppearance({ ...settingsService.getAppearance(), selectedTemplate: pending });
    setActive(pending);
    toastService.success('Modèle appliqué à vos ordonnances');
  };

  const cardBorder = (selected: boolean) => ({
    borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
    boxShadow: selected ? 'var(--shadow-card)' : 'var(--shadow-soft)',
  });
  const ActiveBadge = () => (
    <div className="absolute top-2 right-2 rounded-full flex items-center justify-center text-white"
         style={{ width: 22, height: 22, background: 'var(--color-primary)', boxShadow: 'var(--shadow-soft)' }}
         title="Modèle actuellement utilisé">
      <Check size={13} />
    </div>
  );

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate} dirty={dirty} onSave={apply} saveLabel="Utiliser ce modèle">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Mon design — le design personnalisé est un modèle comme les autres */}
        <div className="text-left rounded-lg border-2 overflow-hidden transition-all flex flex-col" style={cardBorder(pending === 'custom')}>
          <button type="button" onClick={() => hasCustomDesign && setPending('custom')} disabled={!hasCustomDesign}
                  className="relative flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center disabled:cursor-not-allowed"
                  style={{ background: 'var(--color-surface-alt)', minHeight: 220 }}>
            <span className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
              <Pencil size={20} />
            </span>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>Mon design</span>
            <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {hasCustomDesign ? 'Votre ordonnance personnalisée.' : 'Aucun design enregistré pour l\'instant.'}
            </span>
            {active === 'custom' && <ActiveBadge />}
          </button>
          <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--color-primary)' }} />
            <span className="text-[12.5px] font-medium flex-1 truncate" style={{ color: 'var(--color-text)' }}>Personnalisé</span>
            <SettingsLink onClick={() => onNavigate({ section: 'documents', tab: 'design' })}>{hasCustomDesign ? 'Modifier' : 'Créer'}</SettingsLink>
          </div>
        </div>

        {PRESCRIPTION_TEMPLATE_META.map(meta => {
          const isSelected = pending === meta.id;
          const isActive = active === meta.id;
          return (
            <button key={meta.id} type="button" onClick={() => setPending(meta.id)}
                    aria-pressed={isSelected}
                    className="text-left rounded-lg border-2 overflow-hidden transition-all group" style={cardBorder(isSelected)}>
              <div className="relative" style={{ background: 'var(--color-surface-alt)' }}>
                <TemplateThumbnail component={meta.component} doctor={doctor} />
                {isActive && <ActiveBadge />}
                {isSelected && !isActive && <div className="absolute inset-0" style={{ background: 'rgba(26,107,138,0.06)' }} />}
              </div>
              <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.accent }} />
                <span className="text-[12.5px] font-medium flex-1 truncate" style={{ color: 'var(--color-text)' }}>{meta.label}</span>
                {isActive && <span className="text-[9.5px] font-medium uppercase tracking-wider shrink-0" style={{ color: 'var(--color-primary)' }}>Actif</span>}
              </div>
            </button>
          );
        })}
      </div>
    </SettingsPageFrame>
  );
};

// ═══════════ Mon design ═══════════
const DesignTab: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const doctor = useMemo(() => dataService.getDoctorInfo(), []);
  const initial = useMemo(() => settingsService.getAppearance(), []);
  const editorRef = useRef<OrdonnanceEditorHandle>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges('documents/design', dirty);
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  // Enregistrer le design l'active aussi comme modèle d'ordonnance. Le format
  // papier est partagé avec l'onglet Impression. Ne touche jamais DoctorInfo.
  const handleSave = ({ config, paperSize }: OrdonnanceSaveResult) => {
    settingsService.saveAppearance({ ...settingsService.getAppearance(), selectedTemplate: 'custom', customTemplateConfig: config, paperSize });
  };

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate} dirty={dirty} onSave={() => editorRef.current?.save()} saveLabel="Enregistrer le design" fill>
      <div className="h-full" style={{ minHeight: 640 }}>
        <OrdonnanceEditorApp
          ref={editorRef}
          externalSave
          doctor={doctor}
          website={initial.website}
          paperSize={initial.paperSize}
          initialConfig={initial.customTemplateConfig}
          onSave={handleSave}
          onDirtyChange={onDirtyChange}
          onEditCabinet={() => onNavigate({ section: 'cabinet', tab: 'coordonnees' })}
          onEditProfile={() => onNavigate({ section: 'profile' })}
        />
      </div>
    </SettingsPageFrame>
  );
};

// ═══════════ Impression ═══════════
// Réglages d'impression + rendu des autres documents (certificats, ordonnances
// combinées). Le fichier du logo appartient à Cabinet › Logo.
const PRINT_FIELDS = [
  'paperSize', 'paperMode',
  'logoScale', 'watermarkOpacity', 'logoPosition',
  'primaryColor', 'headerLayout', 'fontFamily', 'layoutPreset', 'contentVerticalPadding', 'footerVerticalOffset',
  'showSignature', 'signatureLabel', 'enableQrCode', 'qrCodeType', 'qrCodeSize',
] as const;

const PREVIEW_ITEMS: PrescriptionItem[] = [
  { id: '1', medicineName: 'Traitement Médical A', dosage: '1 comprimé x 3 / jour', timing: 'Après repas' },
  { id: '2', medicineName: 'Traitement Médical B', dosage: '1 sachet le soir', timing: 'Avant repas' },
];

const rangeClass = 'h-1.5 rounded-lg appearance-none cursor-pointer';
const rangeStyle = { accentColor: 'var(--color-primary)', background: 'var(--color-border)' } as React.CSSProperties;
const monoSmall = { color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' } as React.CSSProperties;

const PrintTab: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const doctor = useMemo(() => dataService.getDoctorInfo(), []);
  const [saved, setSaved] = useState<PrescriptionAppearance>(() => settingsService.getAppearance());
  const [a, setA] = useState<PrescriptionAppearance>(saved);
  const [previewScale, setPreviewScale] = useState(0.22);
  const dirty = fieldsDiffer(a, saved, PRINT_FIELDS);
  useUnsavedChanges('documents/impression', dirty);
  const update = (patch: Partial<PrescriptionAppearance>) => setA(prev => ({ ...prev, ...patch }));

  const save = async () => {
    const next = { ...settingsService.getAppearance(), ...pickFields(a, PRINT_FIELDS) };
    settingsService.saveAppearance(next);
    // Échelle du logo recopiée dans DoctorInfo (lue par l'impression historique).
    const info = dataService.getDoctorInfo();
    if (info.logoScale !== next.logoScale) await dataService.saveDoctorInfo({ ...info, logoScale: next.logoScale });
    setSaved(next);
    setA(next);
    toastService.success('Réglages d\'impression enregistrés');
  };

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate} dirty={dirty} onSave={save}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SettingsCard title="Format du papier" icon={<FileStack size={16} />} description="Partagé avec l'éditeur Mon design.">
            <Segmented options={[{ id: 'A4', label: 'A4' }, { id: 'A5', label: 'A5' }]} value={a.paperSize || 'A4'} onChange={v => update({ paperSize: v })} />
          </SettingsCard>
          <SettingsCard title="Type de papier" icon={<FileText size={16} />}
                        description="« Papier à en-tête » masque le fond et le filigrane, pour imprimer sur un papier déjà personnalisé.">
            <Segmented options={[{ id: 'blank', label: 'Papier vierge' }, { id: 'letterhead', label: 'Papier à en-tête' }]}
                       value={a.paperMode || 'blank'} onChange={v => update({ paperMode: v })} />
          </SettingsCard>
        </div>

        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>Autres documents</h3>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Certificats et ordonnances combinées. L'ordonnance médicale suit le modèle choisi dans Modèles.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-5">
            <SettingsCard title="Logo" icon={<ImageIcon size={16} />}
                          actions={<SettingsLink onClick={() => onNavigate({ section: 'cabinet', tab: 'logo' })}>{a.logoUrl ? 'Changer' : 'Choisir'} dans Cabinet</SettingsLink>}>
              {a.logoUrl ? (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3">
                    <img src={a.logoUrl} alt="Logo du cabinet" className="w-12 h-12 object-contain rounded border bg-white p-1" style={{ borderColor: 'var(--color-border)' }} />
                    <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Logo du cabinet</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>Échelle</span>
                    <input type="range" min="0.5" max="2.5" step="0.1" aria-label="Échelle du logo" value={a.logoScale}
                           onChange={e => update({ logoScale: parseFloat(e.target.value) })} className={`flex-1 ${rangeClass}`} style={rangeStyle} />
                    <span className="text-[10px] w-9 text-right" style={monoSmall}>{a.logoScale}x</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>Opacité</span>
                    <input type="range" min="0.05" max="1.0" step="0.05" aria-label="Opacité du filigrane" value={a.watermarkOpacity}
                           onChange={e => update({ watermarkOpacity: parseFloat(e.target.value) })} className={`flex-1 ${rangeClass}`} style={rangeStyle} />
                    <span className="text-[10px] w-9 text-right" style={monoSmall}>{Math.round((a.watermarkOpacity || 0.1) * 100)}%</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium block mb-2" style={{ color: 'var(--color-text-muted)' }}>Alignement</span>
                    <Segmented size="sm" value={a.logoPosition || 'left'} onChange={v => update({ logoPosition: v })}
                               options={[{ id: 'left', label: 'Gauche' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Droite' }]} />
                  </div>
                </div>
              ) : (
                <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Ces documents n'affichent pas de logo. Ajoutez ou remplacez le logo dans Cabinet › Logo pour régler ici son affichage.</p>
              )}
            </SettingsCard>

            <SettingsCard title="Style & mise en page" icon={<Monitor size={16} />}>
              <div className="space-y-5">
                <div>
                  <span className={labelEyebrow} style={labelEyebrowStyle}>Couleur signature</span>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border shrink-0 relative overflow-hidden" style={{ backgroundColor: a.primaryColor, borderColor: 'var(--color-border)' }}>
                      <input type="color" aria-label="Choisir la couleur" value={a.primaryColor} onChange={e => update({ primaryColor: e.target.value })}
                             className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    </div>
                    <input type="text" aria-label="Couleur (hexadécimal)" value={a.primaryColor} onChange={e => update({ primaryColor: e.target.value })}
                           className="flex-1 h-10 px-3 rounded-md border text-[13px] uppercase font-medium bg-white"
                           style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={labelEyebrow} style={labelEyebrowStyle}>Disposition</span>
                    <select aria-label="Disposition" value={a.headerLayout} onChange={e => update({ headerLayout: e.target.value as any })} className={input40} style={inputStyle}>
                      <option value="classic">Classique</option>
                      <option value="modern">Moderne</option>
                      <option value="minimal">Minimaliste</option>
                    </select>
                  </div>
                  <div>
                    <span className={labelEyebrow} style={labelEyebrowStyle}>Police</span>
                    <select aria-label="Police" value={a.fontFamily} onChange={e => update({ fontFamily: e.target.value as any })} className={input40} style={inputStyle}>
                      <option value="serif">Sérif (Médical)</option>
                      <option value="sans">Sans-Sérif (Moderne)</option>
                      <option value="mono">Monospace (Technique)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <span className={labelEyebrow} style={labelEyebrowStyle}>Style de mise en page</span>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(['classic', 'modern', 'elegant'] as const).map(preset => (
                      <button key={preset} type="button" onClick={() => update({ layoutPreset: preset })} aria-pressed={a.layoutPreset === preset}
                              className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all"
                              style={a.layoutPreset === preset
                                ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', color: 'var(--color-primary)' }
                                : { background: 'white', borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}>
                        <Monitor size={18} />
                        <span className="text-[10px] uppercase font-medium">{preset}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Marge haut</span>
                      <span className="text-[10px]" style={monoSmall}>{a.contentVerticalPadding || 40}px</span>
                    </div>
                    <input type="range" min="0" max="300" step="10" aria-label="Marge haut" value={a.contentVerticalPadding || 40}
                           onChange={e => update({ contentVerticalPadding: parseInt(e.target.value) })} className={`w-full ${rangeClass}`} style={rangeStyle} />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Position pied</span>
                      <span className="text-[10px]" style={monoSmall}>{a.footerVerticalOffset || 0}px</span>
                    </div>
                    <input type="range" min="-100" max="100" step="5" aria-label="Position du pied de page" value={a.footerVerticalOffset || 0}
                           onChange={e => update({ footerVerticalOffset: parseInt(e.target.value) })} className={`w-full ${rangeClass}`} style={rangeStyle} />
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Signature & QR code" icon={<QrCode size={16} />}
                          actions={<SettingsLink onClick={() => onNavigate({ section: 'profile' })}>Images dans Mon profil</SettingsLink>}>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Afficher cachet &amp; signature</span>
                  <Toggle label="Afficher cachet et signature" checked={a.showSignature !== false} onChange={v => update({ showSignature: v })} />
                </div>
                {a.showSignature !== false && (
                  <div>
                    <span className={labelEyebrow} style={labelEyebrowStyle}>Libellé signature</span>
                    <input type="text" aria-label="Libellé signature" value={a.signatureLabel || 'Cachet & Signature'}
                           onChange={e => update({ signatureLabel: e.target.value })} className={input40} style={inputStyle} placeholder="Cachet & Signature" />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium flex items-center gap-2" style={{ color: 'var(--color-text)' }}><QrCode size={15} /> Activer le code QR</span>
                  <Toggle label="Activer le code QR" checked={!!a.enableQrCode} onChange={v => update({ enableQrCode: v })} />
                </div>
                {a.enableQrCode && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[12px] font-medium block mb-2" style={{ color: 'var(--color-text)' }}>Contenu du QR code</span>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {[
                          { id: 'AUTOMATIC', label: 'Auto', icon: QrCode },
                          { id: 'VCARD', label: 'Contact', icon: User },
                          { id: 'WHATSAPP', label: 'WhatsApp', icon: Phone },
                          { id: 'URL', label: 'Lien Web', icon: Globe },
                        ].map(type => {
                          const on = a.qrCodeType === type.id || (!a.qrCodeType && type.id === 'AUTOMATIC');
                          return (
                            <button key={type.id} type="button" onClick={() => update({ qrCodeType: type.id as any })} aria-pressed={on}
                                    className="p-2.5 rounded-lg border transition-all flex flex-col items-center gap-1.5"
                                    style={on
                                      ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', color: 'var(--color-primary)' }
                                      : { background: 'white', borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}>
                              <type.icon size={15} />
                              <span className="text-[9px] uppercase font-medium">{type.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Taille du QR</span>
                      <div className="flex items-center gap-2">
                        <input type="range" min="50" max="250" step="10" aria-label="Taille du QR code" value={a.qrCodeSize || 120}
                               onChange={e => update({ qrCodeSize: parseInt(e.target.value) })} className={`w-28 ${rangeClass}`} style={rangeStyle} />
                        <span className="text-[10px] w-8" style={monoSmall}>{a.qrCodeSize || 120}px</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </SettingsCard>
          </div>

          <div className="lg:col-span-7">
            <div className="sticky top-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider" style={labelEyebrowStyle}>Aperçu</span>
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md" style={{ background: 'var(--color-surface-alt)' }}>
                  <Monitor size={13} style={{ color: 'var(--color-text-subtle)' }} />
                  <input type="range" min="0.15" max="0.5" step="0.01" aria-label="Zoom de l'aperçu" value={previewScale}
                         onChange={e => setPreviewScale(parseFloat(e.target.value))} className={`w-24 ${rangeClass}`} style={rangeStyle} />
                  <span className="text-[10px] w-8" style={{ color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)' }}>{Math.round(previewScale * 100)}%</span>
                </div>
              </div>
              <div className="w-full rounded-xl p-5 overflow-hidden flex justify-center items-start border"
                   style={{ background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)', height: 3508 * previewScale + 40 }}>
                <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', width: '2480px', height: '3508px', boxShadow: 'var(--shadow-premium)', flexShrink: 0 }}>
                  <CombinedConsultationTemplate
                    doctor={doctor}
                    appearance={a}
                    patient={{ name: 'Patient Prototype', age: 35, type: 'Adult' }}
                    items={PREVIEW_ITEMS}
                    tests={['Analyse A', 'Analyse B']}
                    date="26/10/2026"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SettingsPageFrame>
  );
};

export default DocumentsSettings;

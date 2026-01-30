
import React, { useState, useEffect, useRef } from 'react';
import {
  Pill, Plus, Search, Trash2, FileUp, Download, Filter, Sparkles,
  Loader2, FileText, X, Check, ChevronRight, FileDown, AlertTriangle,
  Info, Clock, Syringe, Thermometer, ShieldCheck, HeartPulse,
  ClipboardType, UploadCloud, Wand2, ScanSearch, Database, Save, RefreshCw,
  ChevronUp, ChevronDown
} from 'lucide-react';
import { dataService, CATEGORY_POSOLOGY } from '../services/dataService';
import { Medicine, MedicineCategory, MealTiming } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const MEDICINES_LOCALSTORAGE_KEY = 'docease_meds_memory';

const categoryIcons: Record<string, any> = {
  'Antibiotique': Syringe,
  'Vitamine': Sparkles,
  'Antalgique': HeartPulse,
  'Anti-inflammatoire': Thermometer,
  'Sirop': Pill,
  'Autre': Info
};

// Interface pour le format JSON du template
interface MedicineJsonFormat {
  id: string | number;
  name: string;
  dosage: string;
  category: string;
  interaction_risk: string[];
  description?: string;
}

type SortField = 'name' | 'category' | 'defaultTiming';

const MedicineManager: React.FC = () => {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MedicineCategory | 'Tous'>('Tous');
  const [isAdding, setIsAdding] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showImportCenter, setShowImportCenter] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  const categories: (MedicineCategory | 'Tous')[] = [
    'Tous', 'Antibiotique', 'Vitamine', 'Antalgique', 'Anti-inflammatoire', 'Sirop', 'Autre'
  ];

  const [newMed, setNewMed] = useState<Partial<Medicine>>({
    name: '',
    category: 'Autre',
    defaultDosage: '',
    defaultTiming: 'Indifférent',
    interactionGroup: ''
  });

  const refreshMedicines = () => {
    setMedicines(dataService.getMedicines());
  };

  // Synchronise les médicaments avec localStorage
  const syncMedicinesToLocalStorage = () => {
    try {
      // Convertir au format d'export JSON
      const medicinesForExport: MedicineJsonFormat[] = medicines.map(m => ({
        id: m.id,
        name: m.name,
        dosage: m.defaultDosage,
        category: m.category,
        interaction_risk: m.interactionGroup ? m.interactionGroup.split(',').map(s => s.trim()) : []
      }));

      const data = {
        exportDate: new Date().toISOString(),
        count: medicines.length,
        medications: medicinesForExport
      };

      localStorage.setItem(MEDICINES_LOCALSTORAGE_KEY, JSON.stringify(data));
      setLastSyncTime(new Date().toLocaleTimeString('fr-FR'));
    } catch (error) {
      console.error('Erreur de sauvegarde localStorage:', error);
    }
  };

  // Récupère les médicaments depuis localStorage s'ils existent
  useEffect(() => {
    refreshMedicines();
    try {
      const stored = localStorage.getItem(MEDICINES_LOCALSTORAGE_KEY);
      if (stored) {
        const lastSync = new Date().toLocaleTimeString('fr-FR');
        setLastSyncTime(lastSync);
      }
    } catch (error) {
      console.error('Erreur lecture localStorage:', error);
    }
  }, []);

  // Sauvegarde dans localStorage dès que medicines change
  useEffect(() => {
    if (medicines.length > 0) {
      syncMedicinesToLocalStorage();
    }
  }, [medicines]);

  const handleAdd = () => {
    if (!newMed.name || !newMed.defaultDosage) return alert("Veuillez remplir le nom et la posologie.");
    const medicine: Medicine = {
      id: Date.now().toString(),
      name: newMed.name,
      category: (newMed.category as MedicineCategory) || 'Autre',
      defaultDosage: newMed.defaultDosage,
      defaultTiming: (newMed.defaultTiming as MealTiming) || 'Indifférent',
      isAdultOnly: false,
      interactionGroup: newMed.interactionGroup?.trim() || undefined
    };
    dataService.saveMedicine(medicine);
    refreshMedicines();
    setNewMed({ name: '', category: 'Autre', defaultDosage: '', defaultTiming: 'Indifférent', interactionGroup: '' });
    setIsAdding(false);
  };

  const processAiExtraction = async (content: { text?: string, fileBase64?: string, mimeType?: string }) => {
    setIsAiProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];

      if (content.fileBase64 && content.mimeType) {
        parts.push({ inlineData: { data: content.fileBase64, mimeType: content.mimeType } });
      }

      const prompt = `MISSION D'EXTRACTION TOTALE :
      Tu es un expert en pharmacie marocaine. Ton but est d'extraire TOUS les médicaments sans exception de ce document.
      
      CONSIGNES :
      1. Parcoure le document de haut en bas, page par page.
      2. Ne saute aucune ligne, même si la liste est très longue.
      3. Identifie chaque nom commercial (ex: Aclav, Doliprane, Exacyl, etc.).
      4. Assigne une catégorie parmi : (Antibiotique, Vitamine, Antalgique, Anti-inflammatoire, Sirop, Autre).
      5. Si une posologie est mentionnée, extrais-la (ex: 1 cp x 3/j). Sinon, mets la posologie marocaine standard.
      6. Moment de prise : (Avant repas, Pendant repas, Après repas, Indifférent).

      ${content.text ? `TEXTE À ANALYSER : "${content.text}"` : 'ANALYSE LE FICHIER CI-JOINT.'}
      
      RETOURNE EXCLUSIVEMENT UN TABLEAU JSON.`;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING, enum: ['Antibiotique', 'Vitamine', 'Antalgique', 'Anti-inflammatoire', 'Sirop', 'Autre'] },
                defaultDosage: { type: Type.STRING },
                defaultTiming: { type: Type.STRING, enum: ['Avant repas', 'Pendant repas', 'Après repas', 'Indifférent'] },
              },
              required: ['name', 'category', 'defaultDosage', 'defaultTiming'],
            },
          },
        },
      });

      const extracted = JSON.parse(response.text);
      if (Array.isArray(extracted) && extracted.length > 0) {
        dataService.importMedicines(extracted);
        refreshMedicines();
        alert(`Succès : ${extracted.length} médicaments importés. Ils sont maintenant disponibles dans votre barre de recherche.`);
        setShowImportCenter(false);
        setPastedText('');
      } else {
        alert("Aucun médicament détecté. Essayez un document plus clair.");
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      alert("Erreur lors de la lecture du PDF. Assurez-vous qu'il n'est pas protégé par mot de passe.");
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      processAiExtraction({ fileBase64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  // Télécharge un template de structure JSON
  const downloadTemplate = () => {
    const template = {
      name: "template_meds",
      version: "1.0",
      count: 5,
      medications: [
        {
          id: "1",
          name: "Doliprane",
          dosage: "1000mg",
          category: "Antalgique",
          interaction_risk: ["Warfarine", "Méthotrexate"],
          description: "Paracétamol utilisé pour la douleur et la fièvre."
        },
        {
          id: "2",
          name: "Augmentin",
          dosage: "875mg",
          category: "Antibiotique",
          interaction_risk: ["Méthotrexate", "Warfarine"],
          description: "Association amoxicilline/acide clavulanique, antibiotique à large spectre."
        },
        {
          id: "3",
          name: "Inexium",
          dosage: "20mg",
          category: "Autre",
          interaction_risk: ["Clopidogrel", "Méthotrexate"],
          description: "Oméprazole, réduit la sécrétion acide gastrique."
        },
        {
          id: "4",
          name: "Aspirine Bayer",
          dosage: "100mg",
          category: "Antalgique",
          interaction_risk: ["Warfarine", "Héparine", "AINS"],
          description: "Acide acétylsalicylique à faibles doses, effets antiplaquettaires."
        },
        {
          id: "5",
          name: "Vitamin D3",
          dosage: "2000UI",
          category: "Vitamine",
          interaction_risk: ["Calcium"],
          description: "Vitamine D pour le métabolisme du calcium."
        }
      ]
    };

    const jsonString = JSON.stringify(template, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_meds.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Importe un fichier JSON de médicaments
  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const json = JSON.parse(content);

        // Recherche la mصفوفة dans n'importe quel format
        // Support: tableau direct, json.medications, json.medicines, json.medicaments
        const dataToSave = Array.isArray(json)
          ? json
          : (json.medications || json.medicines || json.medicaments || []);

        if (!Array.isArray(dataToSave) || dataToSave.length === 0) {
          alert('❌ Format JSON invalide.\n\nLe fichier doit contenir :\n• Un tableau direct de médicaments: [...]\n• OU un objet avec "medications", "medicines" ou "medicaments": [...]');
          return;
        }

        // Convertir le format JSON au format Medicine interne
        const convertedMedicines: Medicine[] = dataToSave
          .filter((med: any) => med && med.name) // Filtrer les entrées invalides
          .map((med: any) => ({
            id: String(med.id || Date.now() + Math.random()),
            name: med.name?.toString().trim() || 'Sans nom',
            category: (med.category as MedicineCategory) || 'Autre',
            defaultDosage: med.dosage?.toString().trim() || '',
            defaultTiming: 'Indifférent',
            isAdultOnly: false,
            interactionGroup: Array.isArray(med.interaction_risk)
              ? med.interaction_risk.join(', ')
              : (med.interaction_risk?.toString() || undefined)
          }));

        if (convertedMedicines.length === 0) {
          alert('❌ Aucun médicament valide trouvé dans le fichier.\n\nVérifiez que chaque entrée a au moins un champ "name".');
          return;
        }

        // Extraction des métadonnées si présentes
        let fileVersion = '';
        let exportDate = '';
        if (typeof json === 'object' && !Array.isArray(json)) {
          fileVersion = json.version || json.apiVersion || '';
          exportDate = json.exportDate || json.generated_at || '';
        }

        // Import dans dataService
        const imported = dataService.importMedicines(convertedMedicines);
        refreshMedicines();

        // Sauvegarde dans localStorage avec le bon format et versioning
        try {
          const storageData = {
            version: fileVersion || '1.0',
            exportDate: exportDate || new Date().toISOString(),
            importedAt: new Date().toISOString(),
            count: imported,
            medications: convertedMedicines.map(m => ({
              id: m.id,
              name: m.name,
              dosage: m.defaultDosage,
              category: m.category,
              interaction_risk: m.interactionGroup?.split(', ') || []
            }))
          };
          localStorage.setItem(MEDICINES_LOCALSTORAGE_KEY, JSON.stringify(storageData));
          setLastSyncTime(new Date().toLocaleTimeString('fr-FR'));
        } catch (error) {
          console.error('Erreur sauvegarde localStorage:', error);
        }

        const versionInfo = fileVersion ? `\nVersion: ${fileVersion}` : '';
        const dateInfo = exportDate ? `\nExporté le: ${new Date(exportDate).toLocaleDateString('fr-FR')}` : '';
        alert(`✅ Succès ! ${imported} médicaments chargés.${versionInfo}${dateInfo}`);
        setShowImportCenter(false);
        if (jsonImportRef.current) jsonImportRef.current.value = '';
      } catch (error) {
        console.error('Erreur import JSON:', error);
        alert(`❌ Erreur de parsing JSON.\n\n${error instanceof Error ? error.message : 'Vérifiez le format du fichier.'}\n\nLe fichier doit être un JSON valide.`);
      }
    };
    reader.readAsText(file);
  };

  // Exporte les médicaments actuels en JSON
  const exportMedicines = () => {
    // Convertir les medicines au format d'export (interaction_risk comme array)
    const medicinesForExport: MedicineJsonFormat[] = medicines.map(m => ({
      id: m.id,
      name: m.name,
      dosage: m.defaultDosage,
      category: m.category,
      interaction_risk: m.interactionGroup ? m.interactionGroup.split(',').map(s => s.trim()) : [],
      description: `${m.category} - ${m.defaultTiming}`
    }));

    const exportData = {
      name: "docease_meds_export",
      version: "1.0",
      exportDate: new Date().toISOString(),
      count: medicines.length,
      medications: medicinesForExport
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `docease_meds_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filtered = medicines.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Tous' || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedMedicines = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      const valA = (a[sortBy] || '').toString().toLowerCase();
      const valB = (b[sortBy] || '').toString().toLowerCase();

      if (valA < valB) comparison = -1;
      if (valA > valB) comparison = 1;

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filtered, sortBy, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // RÉGLE IMPORTANTE : On n'affiche rien si la recherche est vide (pour ne pas saturer l'écran avec 4000 lignes)
  const displayMedicines = searchTerm.length >= 2 ? sortedMedicines : [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 text-black">

      {/* AI PROCESSING OVERLAY */}
      {isAiProcessing && (
        <div className="fixed inset-0 bg-indigo-900/60 backdrop-blur-md z-[300] flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="w-32 h-32 bg-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl relative">
            <Loader2 size={64} className="text-indigo-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Wand2 size={32} className="text-indigo-400 opacity-30" />
            </div>
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">Lecture de l'intégralité du document</h2>
          <p className="text-indigo-100 font-bold uppercase tracking-widest text-[10px]">L'IA parcourt chaque ligne pour ne rien oublier...</p>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[3rem] shadow-sm border border-emerald-100/30 relative overflow-hidden glass-effect">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
          <Pill size={120} />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-emerald-900 tracking-tight uppercase italic flex items-center gap-3">
            <ShieldCheck className="text-emerald-600" size={32} />
            Répertoire Médical Pro
          </h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <p className="text-emerald-700 font-bold uppercase tracking-widest text-[10px]">{medicines.length} médicaments enregistrés</p>
            {lastSyncTime && <p className="text-emerald-600/60 text-[9px] ml-2">• Synchro: {lastSyncTime}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto relative z-10">
          <button
            onClick={downloadTemplate}
            title="Télécharge un fichier template pour comprendre la structure"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-black rounded-2xl transition-smooth shadow-lg shadow-cyan-100 uppercase text-[10px] tracking-widest"
          >
            <Download size={16} /> Template
          </button>
          <button
            onClick={() => jsonImportRef.current?.click()}
            title="Importe un fichier JSON de médicaments"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-500 hover:bg-teal-600 text-white font-black rounded-2xl transition-smooth shadow-lg shadow-teal-100 uppercase text-[10px] tracking-widest"
          >
            <FileUp size={16} /> JSON
          </button>
          <input type="file" ref={jsonImportRef} onChange={handleJsonImport} accept=".json" className="hidden" />
          <button
            onClick={exportMedicines}
            disabled={medicines.length === 0}
            title="Exporte tous les médicaments en JSON"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white font-black rounded-2xl transition-smooth shadow-lg shadow-emerald-100 uppercase text-[10px] tracking-widest"
          >
            <Save size={16} /> Export
          </button>
          <button
            onClick={() => setShowImportCenter(!showImportCenter)}
            className={`flex items-center justify-center gap-2 px-4 py-3 font-black rounded-2xl transition-smooth shadow-lg uppercase text-[10px] tracking-widest ${showImportCenter ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-indigo-600 text-white shadow-indigo-100'}`}
          >
            {showImportCenter ? <X size={16} /> : <FileUp size={16} />}
            {showImportCenter ? 'Annuler' : 'IA-Scan'}
          </button>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-100 transition-smooth uppercase text-[10px] tracking-widest"
          >
            {isAdding ? <X size={16} /> : <Plus size={16} />} {isAdding ? 'Annuler' : 'Manuel'}
          </button>
        </div>
      </div>

      {/* AI IMPORT CENTER */}
      {showImportCenter && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95 duration-300">
          {/* Option 1: File Upload */}
          <div
            className="bg-white p-10 rounded-[3rem] border-2 border-dashed border-indigo-200/50 flex flex-col items-center justify-center text-center space-y-6 hover:border-indigo-500 hover:bg-indigo-50/30 transition-smooth group cursor-pointer shadow-soft glass-effect"
            onClick={() => aiFileInputRef.current?.click()}
          >
            <div className="w-20 h-20 bg-indigo-100/50 text-indigo-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <UploadCloud size={40} />
            </div>
            <div>
              <h3 className="font-black text-emerald-900 uppercase text-sm">Scanner un document (PDF/Scan)</h3>
              <p className="text-[10px] text-emerald-600/60 font-bold uppercase mt-1">L'IA mémorise tout le contenu sans exception</p>
            </div>
            <input type="file" ref={aiFileInputRef} onChange={handleFileUpload} accept=".pdf,image/*" className="hidden" />
            <div className="px-8 py-3 bg-white border border-emerald-200 text-indigo-600 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-soft group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
              Sélectionner le fichier
            </div>
          </div>

          {/* Option 2: Text Paste */}
          <div className="bg-white p-10 rounded-[3rem] border border-emerald-100/30 flex flex-col space-y-4 shadow-soft glass-effect">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100/50 text-amber-600 rounded-xl flex items-center justify-center">
                <ClipboardType size={20} />
              </div>
              <div>
                <h3 className="font-black text-emerald-900 uppercase text-xs">Copier-Coller depuis Word</h3>
                <p className="text-[9px] text-emerald-600/60 font-bold uppercase">Texte provenant d'un fichier Word ou Email</p>
              </div>
            </div>
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder="Ex: Aclav 1g 1cp x 2/j, Doliprane 1g..."
              className="flex-1 min-h-[140px] p-5 bg-emerald-50/30 border border-emerald-200/50 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none text-emerald-900"
            />
            <button
              disabled={!pastedText.trim()}
              onClick={() => processAiExtraction({ text: pastedText })}
              className="w-full py-4 bg-gradient-emerald-teal text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-amber-100 disabled:opacity-30 transition-all hover:shadow-soft-lg"
            >
              Traiter le texte par IA
            </button>
          </div>
        </div>
      )}

      {/* MANUAL ADD FORM */}
      {isAdding && (
        <div className="bg-white p-8 rounded-[3rem] shadow-soft border border-emerald-100/30 glass-effect animate-in zoom-in-95 duration-300">
          <h3 className="text-xl font-black text-emerald-900 uppercase tracking-tight mb-6 flex items-center gap-3">
            <Plus size={24} className="text-emerald-600" /> Ajouter un médicament manuellement
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block mb-2">Nom Commercial</label>
              <input
                type="text"
                value={newMed.name || ''}
                onChange={e => setNewMed({ ...newMed, name: e.target.value })}
                placeholder="Ex: Doliprane"
                className="w-full px-4 py-3 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block mb-2">Catégorie</label>
              <select
                value={newMed.category || 'Autre'}
                onChange={e => setNewMed({ ...newMed, category: e.target.value as MedicineCategory })}
                className="w-full px-4 py-3 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-900"
              >
                {categories.filter(c => c !== 'Tous').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block mb-2">Posologie</label>
              <input
                type="text"
                value={newMed.defaultDosage || ''}
                onChange={e => setNewMed({ ...newMed, defaultDosage: e.target.value })}
                placeholder="Ex: 1000mg x 3/j"
                className="w-full px-4 py-3 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block mb-2">Moment de prise</label>
              <select
                value={newMed.defaultTiming || 'Indifférent'}
                onChange={e => setNewMed({ ...newMed, defaultTiming: e.target.value as MealTiming })}
                className="w-full px-4 py-3 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-900"
              >
                <option value="Avant repas">Avant repas</option>
                <option value="Pendant repas">Pendant repas</option>
                <option value="Après repas">Après repas</option>
                <option value="Indifférent">Indifférent</option>
              </select>
            </div>
            {/* Interaction Group field hidden per user preference */}
            {/* <div>
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block mb-2">Groupe d'interaction (optionnel)</label>
              <input
                type="text"
                value={newMed.interactionGroup || ''}
                onChange={e => setNewMed({ ...newMed, interactionGroup: e.target.value })}
                placeholder="Ex: paracetamol"
                className="w-full px-4 py-3 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-900"
              />
            </div> */}
            <button
              onClick={handleAdd}
              className="col-span-1 md:col-span-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-smooth shadow-lg shadow-emerald-100 uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"
            >
              <Check size={16} /> Ajouter
            </button>
          </div>
        </div>
      )}

      {/* SEARCH ENGINE SECTION */}
      <div className="bg-white rounded-[3.5rem] shadow-soft border border-emerald-100/30 overflow-hidden min-h-[500px] flex flex-col glass-effect">
        <div className="p-10 border-b border-emerald-100/20 bg-gradient-emerald-light space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="relative w-full md:w-1/2">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-emerald-600" size={24} />
              <input
                type="text"
                placeholder="Rechercher un médicament (Tapez au moins 2 lettres)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-16 pr-8 py-5 bg-white border border-emerald-200/50 rounded-3xl font-black text-lg outline-none focus:ring-4 focus:ring-emerald-500/20 shadow-soft text-emerald-900 placeholder-emerald-400"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-smooth border-2 ${selectedCategory === c ? 'gradient-emerald-teal border-emerald-400 text-white shadow-soft' : 'bg-white border-emerald-200/30 text-emerald-700 hover:border-emerald-400'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-6">
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest px-2">Trier par:</span>
            <div className="flex gap-2 p-1.5 bg-emerald-50 rounded-2xl border border-emerald-100/50">
              {(['name', 'category', 'defaultTiming'] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === field
                    ? 'bg-white text-emerald-600 shadow-md ring-1 ring-emerald-200'
                    : 'text-emerald-400 hover:text-emerald-600'
                    }`}
                >
                  {field === 'name' && 'Nom'}
                  {field === 'category' && 'Catégorie'}
                  {field === 'defaultTiming' && 'Moment'}
                  {sortBy === field && (sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          {searchTerm.length < 2 ? (
            <div className="py-32 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-100/50 rounded-full flex items-center justify-center">
                <Search size={32} className="text-emerald-500" />
              </div>
              <div>
                <h4 className="text-emerald-700 font-black uppercase text-sm tracking-[0.2em]">Prêt pour la recherche</h4>
                <p className="text-[10px] text-emerald-600/60 font-bold uppercase mt-1">Saisissez au moins 2 lettres pour explorer les {medicines.length} médicaments</p>
              </div>
            </div>
          ) : displayMedicines.length === 0 ? (
            <div className="py-32 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
                <Search size={32} className="text-emerald-200" />
              </div>
              <div>
                <h4 className="text-emerald-600 font-black uppercase text-sm tracking-[0.2em]">Aucun résultat trouvé</h4>
                <p className="text-[10px] text-emerald-600/60 font-bold uppercase mt-1">Réessayez ou importez de nouveaux médicaments</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-emerald-100/20">
                  <th className="px-10 py-6 text-[10px] font-black text-emerald-700 uppercase tracking-widest">Nom Commercial</th>
                  <th className="px-10 py-6 text-[10px] font-black text-emerald-700 uppercase tracking-widest">Catégorie</th>
                  <th className="px-10 py-6 text-[10px] font-black text-emerald-700 uppercase tracking-widest">Posologie par défaut</th>
                  <th className="px-10 py-6 text-[10px] font-black text-emerald-700 uppercase tracking-widest text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100/20">
                {displayMedicines.map(m => {
                  const Icon = categoryIcons[m.category] || Pill;
                  return (
                    <tr key={m.id} className="hover:bg-emerald-50/30 transition-colors group">
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 gradient-emerald-light text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                            <Icon size={22} />
                          </div>
                          <p className="font-black text-emerald-900 uppercase text-sm tracking-tight">{m.name}</p>
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <span className="px-4 py-1.5 bg-teal-100/50 text-teal-700 rounded-xl text-[10px] font-black uppercase tracking-widest">
                          {m.category}
                        </span>
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-black text-emerald-800">{m.defaultDosage}</p>
                          <p className="text-[9px] text-emerald-600/70 font-black uppercase tracking-widest flex items-center gap-1 leading-none"><Clock size={10} /> {m.defaultTiming}</p>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <button onClick={() => { if (window.confirm("Supprimer ce médicament ?")) { dataService.deleteMedicine(m.id); refreshMedicines(); } }} className="p-3 text-emerald-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-smooth">
                          <Trash2 size={20} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default MedicineManager;

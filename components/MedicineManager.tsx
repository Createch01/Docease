import React, { useState, useEffect, useRef } from 'react';
import {
  Pill, Plus, Search, Trash2, FileUp, Download, Filter, Sparkles,
  Loader2, FileText, X, Check, ChevronRight, FileDown, AlertTriangle,
  Info, Clock, Syringe, Thermometer, ShieldCheck, HeartPulse,
  ClipboardType, UploadCloud, Wand2, ScanSearch, Database, Save, RefreshCw,
  ChevronUp, ChevronDown, ShieldAlert, Baby, Zap
} from 'lucide-react';
import { dataService, CATEGORY_POSOLOGY } from '../services/dataService';
import { heuristicJsonService } from '../services/heuristicJsonService';
import { autoImportService } from '../services/autoImportService';
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
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'ia' | 'json' | 'template' | 'maintenance'>('list');

  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  const categories: (MedicineCategory | 'Tous')[] = [
    'Tous', 'Antibiotique', 'Vitamine', 'Antalgique', 'Anti-inflammatoire', 'Sirop', 'Autre'
  ];

  const [loading, setLoading] = useState(false);
  const [newMed, setNewMed] = useState<Partial<Medicine>>({
    name: '',
    category: 'Autre',
    defaultDosage: '',
    defaultTiming: 'Indifférent',
    isAdultOnly: false,
    isPregnantForbidden: false,
    isBreastfeedingForbidden: false,
    isHeartForbidden: false,
    isKidneyForbidden: false,
    isLiverForbidden: false,
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

    // Check for duplicate name
    const allMeds = dataService.getMedicines();
    const isDuplicate = allMeds.some(m => m.name.trim().toLowerCase() === newMed.name?.trim().toLowerCase());

    if (isDuplicate) {
      if (!window.confirm(`Le médicament "${newMed.name}" existe déjà dans votre base. Voulez-vous mettre à jour ses informations ?`)) {
        return;
      }
    }

    const medicine: Medicine = {
      id: Date.now().toString(),
      name: newMed.name,
      category: (newMed.category as MedicineCategory) || 'Autre',
      defaultDosage: newMed.defaultDosage,
      defaultTiming: (newMed.defaultTiming as MealTiming) || 'Indifférent',
      isAdultOnly: newMed.isAdultOnly || false,
      isPregnantForbidden: newMed.isPregnantForbidden || false,
      isBreastfeedingForbidden: newMed.isBreastfeedingForbidden || false,
      isHeartForbidden: newMed.isHeartForbidden || false,
      isKidneyForbidden: newMed.isKidneyForbidden || false,
      isLiverForbidden: newMed.isLiverForbidden || false,
      interactionGroup: newMed.interactionGroup?.trim() || undefined
    };
    dataService.saveMedicine(medicine);
    refreshMedicines();
    setNewMed({
      name: '', category: 'Autre', defaultDosage: '', defaultTiming: 'Indifférent', interactionGroup: '',
      isAdultOnly: false, isPregnantForbidden: false, isBreastfeedingForbidden: false,
      isHeartForbidden: false, isKidneyForbidden: false, isLiverForbidden: false
    });
    setIsAdding(false);
  };

  const processAiExtraction = async (content: { text?: string, fileBase64?: string, mimeType?: string }) => {
    setIsAiProcessing(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1' });
      const parts: any[] = [];

      if (content.fileBase64 && content.mimeType) {
        parts.push({ inlineData: { data: content.fileBase64, mimeType: content.mimeType } });
      }

      const prompt = `MISSION D'EXTRACTION TOTALE :
      Tu es un expert en pharmacie marocaine. Ton but est d'extraire TOUS les médicaments sans exception de ce document (ordonnance, facture, listing).
      
      CONSIGNES :
      1. Parcoure le document de haut en bas, page par page.
      2. Ne saute aucune ligne, ignore les en-têtes/pieds de page inutiles.
      3. Identifie chaque nom commercial (ex: Aclav, Doliprane, Exacyl, etc.).
      4. Assigne une catégorie parmi : (Antibiotique, Vitamine, Antalgique, Anti-inflammatoire, Sirop, Autre).
      5. Si une posologie est mentionnée, extrais-la (ex: 1 cp x 3/j, 500mg, etc.). Sinon, mets la posologie marocaine standard pour ce médicament.
      6. Moment de prise : (Avant repas, Pendant repas, Après repas, Indifférent).
      7. En cas de doute sur une ligne, ignore-la plutôt que d'inventer.

      ${content.text ? `TEXTE À ANALYSER : "${content.text}"` : 'ANALYSE LE FICHIER CI-JOINT (PDF/IMAGE).'}
      
      RETOURNE EXCLUSIVEMENT UN TABLEAU JSON VALIDE.`;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
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

      // Nettoyage de la réponse pour éviter les erreurs de parsing (markdown fences)
      let cleanText = response.text || "[]";
      cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();

      const extracted = JSON.parse(cleanText);
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

  const handleJsonFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        // Handle various JSON formats (array or object with medications property)
        let medList: any[] = [];
        if (Array.isArray(data)) {
          medList = data;
        } else if (data.medications && Array.isArray(data.medications)) {
          medList = data.medications;
        } else if (data.medicines && Array.isArray(data.medicines)) {
          medList = data.medicines;
        }

        if (medList.length > 0) {
          if (window.confirm(`Importer ${medList.length} médicaments à partir du fichier ?`)) {
            dataService.importMedicines(medList);
            refreshMedicines();
            alert(`✅ Importation réussie : ${medList.length} médicaments ajoutés.`);
            setActiveTab('list');
          }
        } else {
          alert("❌ Format de fichier non reconnu ou aucun médicament trouvé.");
        }
      } catch (err) {
        console.error("JSON Parse Error:", err);
        alert("❌ Erreur de lecture du fichier JSON. Vérifiez le format.");
      }
    };
    reader.readAsText(file);
    // Reset input value to allow re-selecting the same file
    e.target.value = '';
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

        let processedData = json;
        // Handle fragmented format
        if (Array.isArray(json) && json.length > 0 && json[0].hasOwnProperty('content') && json[0].hasOwnProperty('page')) {
          try {
            const combined = json.map((p: any) => p.content).join('');
            processedData = JSON.parse(combined);
          } catch (e) {
            console.warn("Fragmented parse failed", e);
          }
        }

        const convertedMedicines = heuristicJsonService.extractMedicines(processedData);

        if (convertedMedicines.length === 0) {
          alert('❌ Aucun médicament valide trouvé.');
          return;
        }

        dataService.importMedicines(convertedMedicines);
        refreshMedicines();
        alert(`✅ Importation réussie : ${convertedMedicines.length} médicaments.`);
        setShowImportCenter(false);
        if (jsonImportRef.current) jsonImportRef.current.value = '';
      } catch (error) {
        console.error('Import error:', error);
        alert('❌ Erreur de lecture JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleAutoScan = async () => {
    setLoading(true);
    await autoImportService.runAutoImport();
    refreshMedicines();
    setLoading(false);
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
      // Prioritize "starts with" matches when sorting by name if there's a search term
      if (sortBy === 'name' && searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const aStarts = a.name.toLowerCase().startsWith(searchLower);
        const bStarts = b.name.toLowerCase().startsWith(searchLower);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
      }

      let comparison = 0;
      const valA = (a[sortBy] || '').toString().toLowerCase();
      const valB = (b[sortBy] || '').toString().toLowerCase();

      if (valA < valB) comparison = -1;
      if (valA > valB) comparison = 1;

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filtered, sortBy, sortOrder, searchTerm]);

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
            onClick={() => setActiveTab('add')}
            className={`flex-1 md:flex-none px-6 py-3 font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${activeTab === 'add' ? 'bg-emerald-700 text-white shadow-inner' : 'bg-emerald-600 text-white shadow-xl shadow-emerald-200 hover:bg-emerald-700'}`}
          >
            <Plus size={16} /> Nouveau
          </button>
          <button
            onClick={() => setActiveTab('ia')}
            className={`flex-1 md:flex-none px-6 py-3 font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${activeTab === 'ia' ? 'bg-indigo-700 text-white shadow-inner' : 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700'}`}
          >
            <Wand2 size={16} /> IA-Scan
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`flex-1 md:flex-none px-6 py-3 font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${activeTab === 'json' ? 'bg-amber-600 text-white shadow-inner' : 'bg-amber-500 text-white shadow-xl shadow-amber-100 hover:bg-amber-600'}`}
          >
            <Database size={16} /> JSON
          </button>
          <button
            onClick={() => {
              const data = JSON.stringify(medicines, null, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `docease_medicines_${new Date().toISOString().split('T')[0]}.json`;
              a.click();
            }}
            className="p-3 bg-white border border-emerald-100 text-emerald-600 rounded-2xl hover:bg-emerald-50 transition-all shadow-sm"
            title="Exporter tout"
          >
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex bg-white/50 p-1.5 rounded-[2rem] border border-emerald-100/30 gap-1">
        {[
          { id: 'list', label: 'Répertoire', icon: Search },
          { id: 'ia', label: 'Scanner IA', icon: Wand2 },
          { id: 'json', label: 'Import JSON', icon: FileUp },
          { id: 'template', label: 'Template structure', icon: FileText },
          { id: 'maintenance', label: 'Maintenance', icon: RefreshCw }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100' : 'text-emerald-900/40 hover:text-emerald-700'}`}
          >
            <tab.icon size={14} />
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* RENDER ACTIVE MODE */}
      <div className="space-y-8 min-h-[400px]">
        {activeTab === 'ia' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95 duration-500">
            {/* Option 1: File Upload */}
            <div
              className="bg-white p-10 rounded-[3rem] border-2 border-dashed border-indigo-200/50 flex flex-col items-center justify-center text-center space-y-6 hover:border-indigo-500 hover:bg-indigo-50/30 transition-smooth group cursor-pointer shadow-soft glass-effect"
              onClick={() => aiFileInputRef.current?.click()}
            >
              <div className="w-20 h-20 bg-indigo-100/50 text-indigo-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <UploadCloud size={40} />
              </div>
              <div>
                <h3 className="font-black text-emerald-900 uppercase text-sm italic">Scanner Intelligent (PDF/Scan)</h3>
                <p className="text-[10px] text-emerald-600/60 font-bold uppercase mt-1">Glissez vos factures ou listes PDF ici</p>
              </div>
              <input type="file" ref={aiFileInputRef} onChange={handleFileUpload} accept=".pdf,image/*" className="hidden" />
              <button className="px-8 py-3 bg-white border border-emerald-200 text-indigo-600 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-soft group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
                Démarrer IA-Scan
              </button>
            </div>

            {/* Option 2: Text Paste */}
            <div className="bg-white p-10 rounded-[3rem] border border-emerald-100/30 flex flex-col space-y-4 shadow-soft glass-effect">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100/50 text-amber-600 rounded-xl flex items-center justify-center">
                  <ClipboardType size={20} />
                </div>
                <div>
                  <h3 className="font-black text-emerald-900 uppercase text-xs italic">Copie Rapide (IA)</h3>
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

        {activeTab === 'json' && (
          <div className="bg-white p-10 rounded-[3rem] shadow-soft border border-emerald-100/30 glass-effect animate-in zoom-in-95 duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                <FileUp size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-emerald-900 uppercase tracking-tight">Importation JSON Directe</h3>
                <p className="text-[10px] text-emerald-600/60 font-black uppercase tracking-widest">Collez vos données ou sélectionnez un fichier</p>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <input
                type="file"
                ref={jsonImportRef}
                onChange={handleJsonFileSelect}
                accept=".json"
                className="hidden"
              />

              <button
                onClick={() => jsonImportRef.current?.click()}
                className="w-full py-6 border-4 border-dashed border-amber-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 hover:bg-amber-50/50 transition-all group active:scale-[0.98]"
              >
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <UploadCloud size={32} />
                </div>
                <div className="text-center">
                  <span className="block text-lg font-black text-amber-900 uppercase tracking-tight">Sélectionner un fichier JSON</span>
                  <span className="block text-[10px] text-amber-600/60 font-black uppercase tracking-widest mt-1">Format .json pris en charge</span>
                </div>
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-emerald-100"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
                  <span className="bg-white px-4 text-emerald-400">Ou collez le JSON ci-dessous</span>
                </div>
              </div>

              <textarea
                placeholder='[ { "name": "Medicament", "category": "Sirop", ... } ]'
                className="w-full h-48 p-6 bg-slate-900 text-emerald-400 font-mono text-xs rounded-3xl border border-emerald-900/20 outline-none focus:ring-4 focus:ring-emerald-500/10"
                onChange={(e) => {
                  try {
                    const data = JSON.parse(e.target.value);
                    if (Array.isArray(data)) {
                      if (window.confirm(`Importer ${data.length} médicaments ?`)) {
                        data.forEach(m => dataService.saveMedicine(m));
                        refreshMedicines();
                        setActiveTab('list');
                      }
                    }
                  } catch (e) { }
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'template' && (
          <div className="bg-white p-10 rounded-[3rem] shadow-soft border border-emerald-100/30 glass-effect animate-in zoom-in-95 duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-emerald-900 uppercase tracking-tight italic">Structure Professionnelle JSON</h3>
                <p className="text-[10px] text-emerald-600/60 font-black uppercase tracking-widest">Format standard pour le répertoire</p>
              </div>
            </div>
            <div className="relative group">
              <pre className="p-8 bg-slate-900 text-emerald-400 font-mono text-xs rounded-3xl overflow-x-auto">
                {JSON.stringify([
                  {
                    name: "NOM_MEDICAMENT",
                    category: "Antibiotique | Vitamine | Autre",
                    defaultDosage: "1cp x 3/j",
                    isAdultOnly: false,
                    isPregnantForbidden: true,
                    isHeartForbidden: false,
                    restriction: {
                      minAge: 6,
                      maxAge: 12,
                      reason: "Dosage pédiatrique"
                    }
                  }
                ], null, 2)}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in zoom-in-95 duration-500">
            {/* Scan Dossier Action */}
            <div className="bg-white p-10 rounded-[3rem] shadow-soft border border-emerald-100/30 glass-effect flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center">
                <RefreshCw size={40} className={loading ? "animate-spin" : ""} />
              </div>
              <div>
                <h3 className="text-xl font-black text-emerald-900 uppercase tracking-tight">Scan du Dossier</h3>
                <p className="text-[10px] text-emerald-600/60 font-black uppercase tracking-widest mt-2">Rechercher de nouveaux médicaments dans les fichiers JSON</p>
              </div>
              <button
                onClick={async () => {
                  setLoading(true);
                  await handleAutoScan();
                  setLoading(false);
                  alert("✅ Scan terminé ! La base de données a été mise à jour.");
                }}
                disabled={loading}
                className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                Lancer le Scan Complet
              </button>
            </div>

            {/* Deduplication Action */}
            <div className="bg-white p-10 rounded-[3rem] shadow-soft border border-amber-100/30 glass-effect flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-[2rem] flex items-center justify-center">
                <Trash2 size={40} />
              </div>
              <div>
                <h3 className="text-xl font-black text-amber-900 uppercase tracking-tight">Supprimer les Doublons</h3>
                <p className="text-[10px] text-amber-600/60 font-black uppercase tracking-widest mt-2">Nettoyer la base de données en fusionnant les noms identiques</p>
              </div>
              <button
                onClick={async () => {
                  setLoading(true);
                  const removed = await dataService.deduplicateMedicines();
                  refreshMedicines();
                  setLoading(false);
                  alert(removed > 0
                    ? `✅ Nettoyage terminé : ${removed} médicaments en double ont été supprimés.`
                    : "✨ Votre base de données est déjà parfaitement propre ! Aucun doublon trouvé.");
                }}
                disabled={loading}
                className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-600 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Trash2 size={18} />
                Nettoyer la Base
              </button>
            </div>
          </div>
        )}

        {/* Existing Add/List logic below */}
        {activeTab === 'add' && (
          <div className="bg-white p-10 rounded-[3rem] shadow-soft border border-emerald-100/30 glass-effect animate-in zoom-in-95 duration-500">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-emerald-900 uppercase tracking-tight flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <Plus size={28} />
                </div>
                Ajout Manuel Pro
              </h3>
              <button onClick={() => setActiveTab('list')} className="p-3 text-emerald-300 hover:text-red-500 transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block px-1">Nom Commercial</label>
                <div className="relative">
                  <Pill className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
                  <input
                    type="text"
                    value={newMed.name || ''}
                    onChange={e => setNewMed({ ...newMed, name: e.target.value })}
                    placeholder="Ex: Doliprane 1g"
                    className="w-full pl-12 pr-4 py-4 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-black outline-none focus:ring-4 focus:ring-emerald-500/10 text-emerald-900 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block px-1">Catégorie</label>
                <div className="relative">
                  <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
                  <select
                    value={newMed.category || 'Autre'}
                    onChange={e => setNewMed({ ...newMed, category: e.target.value as MedicineCategory })}
                    className="w-full pl-12 pr-4 py-4 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-black outline-none focus:ring-4 focus:ring-emerald-500/10 text-emerald-900 appearance-none transition-all"
                  >
                    {categories.filter(c => c !== 'Tous').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block px-1">Posologie Standard</label>
                <div className="relative">
                  <ClipboardType className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
                  <input
                    type="text"
                    value={newMed.defaultDosage || ''}
                    onChange={e => setNewMed({ ...newMed, defaultDosage: e.target.value })}
                    placeholder="Ex: 1 cp x 3/j"
                    className="w-full pl-12 pr-4 py-4 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-black outline-none focus:ring-4 focus:ring-emerald-500/10 text-emerald-900 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block px-1">Moment de prise</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
                  <select
                    value={newMed.defaultTiming || 'Indifférent'}
                    onChange={e => setNewMed({ ...newMed, defaultTiming: e.target.value as MealTiming })}
                    className="w-full pl-12 pr-4 py-4 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl font-black outline-none focus:ring-4 focus:ring-emerald-500/10 text-emerald-900 appearance-none transition-all"
                  >
                    <option value="Avant repas">Avant repas</option>
                    <option value="Pendant repas">Pendant repas</option>
                    <option value="Après repas">Après repas</option>
                    <option value="Indifférent">Indifférent</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 pointer-events-none" size={18} />
                </div>
              </div>

              {/* RESTRICTION SECTION */}
              <div className="md:col-span-2 bg-emerald-50/30 p-6 rounded-[2rem] border border-emerald-100/50 space-y-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
                        <ShieldAlert size={18} />
                      </div>
                      <div>
                        <h4 className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">Restrictions de Sécurité</h4>
                        <p className="text-[9px] text-emerald-600/60 font-bold uppercase">Contrôles automatiques lors de l'ordonnance</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex items-center cursor-pointer group p-2 bg-white rounded-xl border border-emerald-100 hover:border-emerald-300 transition-all">
                      <input type="checkbox" checked={newMed.isAdultOnly || false} onChange={e => setNewMed({ ...newMed, isAdultOnly: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
                      <span className="ml-3 text-[10px] font-black text-gray-700 uppercase">Interdit aux Enfants</span>
                    </label>

                    <label className="flex items-center cursor-pointer group p-2 bg-white rounded-xl border border-emerald-100 hover:border-emerald-300 transition-all">
                      <input type="checkbox" checked={newMed.isPregnantForbidden || false} onChange={e => setNewMed({ ...newMed, isPregnantForbidden: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
                      <span className="ml-3 text-[10px] font-black text-gray-700 uppercase">Interdit Grossesse</span>
                    </label>

                    <label className="flex items-center cursor-pointer group p-2 bg-white rounded-xl border border-emerald-100 hover:border-emerald-300 transition-all">
                      <input type="checkbox" checked={newMed.isBreastfeedingForbidden || false} onChange={e => setNewMed({ ...newMed, isBreastfeedingForbidden: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
                      <span className="ml-3 text-[10px] font-black text-gray-700 uppercase">Interdit Allaitement</span>
                    </label>

                    <label className="flex items-center cursor-pointer group p-2 bg-white rounded-xl border border-emerald-100 hover:border-emerald-300 transition-all">
                      <input type="checkbox" checked={newMed.isHeartForbidden || false} onChange={e => setNewMed({ ...newMed, isHeartForbidden: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
                      <span className="ml-3 text-[10px] font-black text-gray-700 uppercase">Interdit Problème Cardiaque</span>
                    </label>

                    <label className="flex items-center cursor-pointer group p-2 bg-white rounded-xl border border-emerald-100 hover:border-emerald-300 transition-all">
                      <input type="checkbox" checked={newMed.isKidneyForbidden || false} onChange={e => setNewMed({ ...newMed, isKidneyForbidden: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
                      <span className="ml-3 text-[10px] font-black text-gray-700 uppercase">Interdit Insuffisance Rénale</span>
                    </label>

                    <label className="flex items-center cursor-pointer group p-2 bg-white rounded-xl border border-emerald-100 hover:border-emerald-300 transition-all">
                      <input type="checkbox" checked={newMed.isLiverForbidden || false} onChange={e => setNewMed({ ...newMed, isLiverForbidden: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
                      <span className="ml-3 text-[10px] font-black text-gray-700 uppercase">Interdit Insuffisance Hépatique</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-emerald-600/60 uppercase tracking-tighter px-1">Âge Min (Pédiatrie)</label>
                    <input
                      type="number"
                      value={newMed.restriction?.minAge || ''}
                      onChange={e => setNewMed({
                        ...newMed,
                        restriction: { ...newMed.restriction, minAge: parseInt(e.target.value) || undefined } as any
                      })}
                      className="w-full px-4 py-2 bg-white border border-emerald-100 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Ex: 6 ans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-emerald-600/60 uppercase tracking-tighter px-1">Âge Max (Pédiatrie)</label>
                    <input
                      type="number"
                      value={newMed.restriction?.maxAge || ''}
                      onChange={e => setNewMed({
                        ...newMed,
                        restriction: { ...newMed.restriction, maxAge: parseInt(e.target.value) || undefined } as any
                      })}
                      className="w-full px-4 py-2 bg-white border border-emerald-100 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Ex: 12 ans"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-4">
              <button
                onClick={() => setActiveTab('list')}
                className="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black rounded-2xl transition-smooth uppercase text-[10px] tracking-widest"
              >
                Annuler
              </button>
              <button
                onClick={handleAdd}
                className="px-12 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-smooth shadow-xl shadow-emerald-100 uppercase text-[12px] tracking-widest flex items-center justify-center gap-3 active:scale-95"
              >
                <Check size={20} /> Enregistrer le Médicament
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
                            <div className="flex items-center gap-2">
                              <p className="font-black text-emerald-900 uppercase text-sm tracking-tight">{m.name}</p>
                              <div className="flex flex-wrap gap-1">
                                {m.isAdultOnly && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-md text-[8px] font-black uppercase tracking-tighter shadow-sm" title="Adulte Uniquement">
                                    <ShieldAlert size={8} /> Adulte
                                  </span>
                                )}
                                {m.isPregnantForbidden && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-pink-100 text-pink-600 rounded-md text-[8px] font-black uppercase tracking-tighter shadow-sm" title="Interdit Grossesse">
                                    <Zap size={8} /> Grossesse
                                  </span>
                                )}
                                {m.isHeartForbidden && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[8px] font-black uppercase tracking-tighter shadow-sm" title="Interdit Problème Cardiaque">
                                    <HeartPulse size={8} /> Cœur
                                  </span>
                                )}
                                {m.isBreastfeedingForbidden && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-600 rounded-md text-[8px] font-black uppercase tracking-tighter shadow-sm" title="Interdit Allaitement">
                                    <Baby size={8} /> Allaitement
                                  </span>
                                )}
                              </div>
                            </div>
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

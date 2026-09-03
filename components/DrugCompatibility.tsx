import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Search, Pill, RefreshCw, X, UserCircle, Info } from 'lucide-react';
import { dataService } from '../services/dataService';
import { drugRulesService } from '../services/drugRules';
import { Medicine, Patient } from '../types';
import { formatAge } from '../utils/formatters';
import { searchDrugsGlobal, mapMedicamentToMedicine } from '../services/drugCatalogService';

const DrugCompatibility: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMedicines, setSelectedMedicines] = useState<Medicine[]>([]);
    const [interactionResult, setInteractionResult] = useState<string | null>(null);
    const [missingDataWarnings, setMissingDataWarnings] = useState<string[]>([]);
    const [isChecking, setIsChecking] = useState(false);
    const [filteredMedicines, setFilteredMedicines] = useState<Medicine[]>([]);
    const [patientSearch, setPatientSearch] = useState('');
    const [patientSuggestions, setPatientSuggestions] = useState<Patient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    React.useEffect(() => {
        let active = true;
        const fetchMeds = async () => {
            if (!searchQuery.trim() || searchQuery.length < 2) {
                setFilteredMedicines([]);
                return;
            }
            const q = searchQuery.toLowerCase();
            const localMeds = dataService.getMedicines();
            const catalogRaw = await searchDrugsGlobal(q, 10);

            if (!active) return;

            const catalogMeds = catalogRaw.map(mapMedicamentToMedicine);
            const combined = [...localMeds, ...catalogMeds];

            const seen = new Set<string>();
            const dedupe: Medicine[] = [];
            combined.forEach(m => {
                const norm = m.name.toLowerCase();
                if (!seen.has(norm)) {
                    seen.add(norm);
                    dedupe.push(m);
                }
            });

            const results = dedupe.filter(med =>
                (med.name.toLowerCase().includes(q) || (med.active_ingredient && med.active_ingredient.toLowerCase().includes(q))) &&
                !selectedMedicines.some(selected => selected.id === med.id)
            ).slice(0, 5);

            setFilteredMedicines(results);
        };
        fetchMeds();
        return () => { active = false; };
    }, [searchQuery, selectedMedicines]);

    const handleSelectMedicine = (medicine: Medicine) => {
        const newSelected = [...selectedMedicines, medicine];
        setSelectedMedicines(newSelected);
        setInteractionResult(null);
        setSearchQuery('');

        // Auto-check if we have 2+ medicines
        if (newSelected.length >= 2) {
            checkInteractions(newSelected);
        }
    };

    const handleRemoveMedicine = (id: string) => {
        const newSelected = selectedMedicines.filter(m => m.id !== id);
        setSelectedMedicines(newSelected);
        setInteractionResult(null);
        if (newSelected.length >= 2) {
            checkInteractions(newSelected);
        }
    };

    const checkInteractions = (medicines: Medicine[]) => {
        setIsChecking(true);

        // Use the centralized drug rules service
        const items = medicines.map(m => ({
            id: m.id,
            medicineName: m.name,
            dosage: m.defaultDosage || '',
            timing: m.defaultTiming || 'Indifférent'
        }));

        // Use the real selected patient profile if one was chosen; otherwise fall back
        // to a generic adult context (clearly labeled in the UI) so age/pregnancy/organ
        // contraindications aren't silently ignored when a patient IS selected.
        const contextPatient: any = selectedPatient || { type: 'Adult', age: 40 };
        const alerts = drugRulesService.checkRules(contextPatient, items);

        const interactionAlert = alerts.find(a => a.type === 'INTERACTION' || a.type === 'DOUBLON' || a.type === 'CONTRE_INDICATION' || a.type === 'ENFANT_INTERDIT');
        let warning = interactionAlert ? `${interactionAlert.title}: ${interactionAlert.message}` : null;

        // Une absence d'interaction dans la base ne signifie pas "sans risque" : si le contexte
        // patient réel comporte des statuts non renseignés (grossesse, rein, foie, cœur...),
        // le signaler explicitement plutôt que de laisser croire à une vérification complète.
        const missing = selectedPatient
            ? [
                ...drugRulesService.checkMissingData(selectedPatient),
                ...drugRulesService.checkUnstructuredData(selectedPatient),
            ].map(a => a.message)
            : [];

        setTimeout(() => {
            setInteractionResult(warning);
            setMissingDataWarnings(missing);
            setIsChecking(false);
        }, 500);
    };

    React.useEffect(() => {
        if (selectedMedicines.length >= 2) checkInteractions(selectedMedicines);
    }, [selectedPatient]);

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-gray-800">Compatibilité Médicamenteuse</h2>
                <p className="text-gray-500">Vérifiez les interactions entre plusieurs médicaments</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
                {/* Patient context selector */}
                <div className="relative">
                    <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2 block">Patient (contexte de vérification)</label>
                    {selectedPatient ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                            <div className="flex items-center gap-2">
                                <UserCircle size={18} className="text-emerald-600" />
                                <span className="font-medium text-emerald-800">{selectedPatient.name}</span>
                                <span className="text-xs text-emerald-600">({formatAge(selectedPatient)}{selectedPatient.sex === 'F' ? ', F' : ', M'})</span>
                            </div>
                            <button onClick={() => setSelectedPatient(null)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                                placeholder="Rechercher un patient existant (sinon vérification générique adulte)..."
                                value={patientSearch}
                                onChange={(e) => { setPatientSearch(e.target.value); setPatientSuggestions(e.target.value.length > 1 ? dataService.searchPatients(e.target.value) : []); }}
                            />
                            {patientSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                                    {patientSuggestions.map(p => (
                                        <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(''); setPatientSuggestions([]); }} className="w-full px-4 py-3 text-left hover:bg-emerald-50 flex items-center gap-3">
                                            <UserCircle size={16} className="text-gray-400" />
                                            <span className="font-medium text-gray-700">{p.name}</span>
                                            <span className="text-xs text-gray-400">{formatAge(p)}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1"><Info size={12} /> Aucun patient sélectionné — vérification en contexte adulte générique uniquement.</p>
                        </>
                    )}
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        placeholder="Rechercher un médicament..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />

                    {/* Dropdown Results */}
                    {searchQuery && filteredMedicines.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                            {filteredMedicines.map(med => (
                                <button
                                    key={med.id}
                                    onClick={() => handleSelectMedicine(med)}
                                    className="w-full px-4 py-3 text-left hover:bg-emerald-50 flex items-center justify-between group transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                            <Pill size={16} />
                                        </div>
                                        <span className="font-medium text-gray-700 group-hover:text-emerald-700">{med.name}</span>
                                    </div>
                                    <span className="text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded-full uppercase">{med.category}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected Medicines List */}
                <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Médicaments Sélectionnés</label>
                    <div className="flex flex-wrap gap-3 min-h-[100px] p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        {selectedMedicines.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 italic">
                                Aucun médicament sélectionné
                            </div>
                        ) : (
                            selectedMedicines.map(med => (
                                <div key={med.id} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200 animate-in fade-in zoom-in duration-200">
                                    <Pill size={16} className="text-emerald-500" />
                                    <span className="font-medium text-gray-800">{med.name}</span>
                                    <button
                                        onClick={() => handleRemoveMedicine(med.id)}
                                        className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Results Area */}
                {selectedMedicines.length >= 2 && (
                    <div className={`p-6 rounded-xl border-l-4 transition-all duration-300 ${isChecking ? 'bg-gray-50 border-gray-300' :
                        interactionResult ? 'bg-red-50 border-red-500' : 'bg-emerald-50 border-emerald-500'
                        }`}>
                        <div className="flex items-start gap-4">
                            {isChecking ? (
                                <RefreshCw className="animate-spin text-gray-400" size={24} />
                            ) : interactionResult ? (
                                <AlertTriangle className="text-red-500" size={24} />
                            ) : (
                                <CheckCircle className="text-emerald-500" size={24} />
                            )}

                            <div>
                                <h3 className={`text-lg font-bold mb-1 ${isChecking ? 'text-gray-700' :
                                    interactionResult ? 'text-red-700' : 'text-emerald-700'
                                    }`}>
                                    {isChecking ? 'Analyse en cours...' :
                                        interactionResult ? 'Interaction Détectée' : 'Aucune interaction connue'}
                                </h3>
                                <p className={`${isChecking ? 'text-gray-500' :
                                    interactionResult ? 'text-red-600' : 'text-emerald-600'
                                    }`}>
                                    {isChecking ? 'Veuillez patienter pendant que nous vérifions la compatibilité.' :
                                        interactionResult || '✓ Aucune interaction connue dans les données disponibles.'}
                                </p>
                                {!isChecking && !interactionResult && (
                                    <p className="text-xs text-emerald-700/70 mt-1 italic">
                                        Une absence d'interaction dans la base ne signifie pas "sans risque".
                                    </p>
                                )}
                            </div>
                        </div>
                        {!isChecking && missingDataWarnings.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-amber-200/60 space-y-1.5">
                                {missingDataWarnings.map((msg, i) => (
                                    <p key={i} className="text-sm text-amber-700 flex items-start gap-2">
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                        <span>{msg}</span>
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DrugCompatibility;

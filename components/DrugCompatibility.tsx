import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Search, Pill, RefreshCw, X } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Medicine } from '../types';

const DrugCompatibility: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMedicines, setSelectedMedicines] = useState<Medicine[]>([]);
    const [interactionResult, setInteractionResult] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);

    const allMedicines = dataService.getMedicines();

    const filteredMedicines = allMedicines.filter(med =>
        med.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !selectedMedicines.some(selected => selected.id === med.id)
    ).slice(0, 5);

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
        // Simple mock interaction check based on interaction groups in dataService
        // In a real app, this would query a more complex API or database

        let warning = null;

        // Check for matching interaction groups
        const groups: Record<string, string[]> = {};

        medicines.forEach(med => {
            if (med.interactionGroup) {
                if (!groups[med.interactionGroup]) {
                    groups[med.interactionGroup] = [];
                }
                groups[med.interactionGroup].push(med.name);
            }
        });

        for (const [group, meds] of Object.entries(groups)) {
            if (meds.length > 1) {
                warning = `Interaction détectée: ${meds.join(' et ')} appartiennent au même groupe (${group}).`;
                break;
            }
        }

        setTimeout(() => {
            setInteractionResult(warning);
            setIsChecking(false);
        }, 500);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-gray-800">Compatibilité Médicamenteuse</h2>
                <p className="text-gray-500">Vérifiez les interactions entre plusieurs médicaments</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
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
                                        interactionResult || 'Ces médicaments peuvent être pris ensemble selon nos données actuelles.'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DrugCompatibility;

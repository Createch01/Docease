
import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Printer, Check, Wallet, Trash2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { HonoraryNote, HonoraryService, Patient, DoctorInfo, HonoraryMasterService } from '../types';
import { formatCurrencyToWords } from '../utils/numberToWords';
import HonoraryNoteTemplate from './HonoraryNoteTemplate';
// @ts-ignore
import { toastService } from '../services/toastService';
import { settingsService } from '../services/settingsService';

interface HonoraryNoteEditorProps {
    patient: Patient;
    visitId?: string;
    onClose: () => void;
}


const HonoraryNoteEditor: React.FC<HonoraryNoteEditorProps> = ({ patient, visitId, onClose }) => {
    const doctor = dataService.getDoctorInfo();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [masterServices, setMasterServices] = useState<HonoraryMasterService[]>([]);
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState(0);
    const [isAddingNewMaster, setIsAddingNewMaster] = useState(false);
    const [services, setServices] = useState<HonoraryService[]>([]);
    const [total, setTotal] = useState(0);
    const [totalWords, setTotalWords] = useState('');
    const [status, setStatus] = useState<'PAID' | 'UNPAID'>('PAID');
    const [paymentMode, setPaymentMode] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');
    const [isPreview, setIsPreview] = useState(false);
    const [savedNote, setSavedNote] = useState<HonoraryNote | null>(null);

    // Initial load
    useEffect(() => {
        const masters = dataService.getHonoraryMasterServices();
        setMasterServices(masters);
        setServices(masters.map(m => ({ name: m.name, price: m.price, checked: false })));
    }, []);

    // Auto-calculate total and words
    useEffect(() => {
        const newTotal = services.reduce((sum, s) => sum + (s.checked ? (s.price || 0) : 0), 0);
        setTotal(newTotal);
        setTotalWords(formatCurrencyToWords(newTotal, doctor.currency || 'Dirhams'));
    }, [services, doctor.currency]);

    const toggleService = (index: number) => {
        const newServices = [...services];
        newServices[index].checked = !newServices[index].checked;
        setServices(newServices);
    };

    const updatePrice = (index: number, price: number) => {
        const newServices = [...services];
        newServices[index].price = price;
        setServices(newServices);
    };

    const handleAddMaster = () => {
        if (!newServiceName) return;
        const newMaster: HonoraryMasterService = {
            id: Date.now().toString(),
            name: newServiceName,
            price: newServicePrice
        };
        dataService.saveHonoraryMasterService(newMaster);
        const updatedMasters = dataService.getHonoraryMasterServices();
        setMasterServices(updatedMasters);
        setServices(updatedMasters.map(m => {
            const existing = services.find(s => s.name === m.name);
            return { name: m.name, price: m.price, checked: existing ? existing.checked : false };
        }));
        setNewServiceName('');
        setNewServicePrice(0);
        setIsAddingNewMaster(false);
    };

    const handleDeleteMaster = (id: string, name: string) => {
        dataService.deleteHonoraryMasterService(id);
        const updatedMasters = dataService.getHonoraryMasterServices();
        setMasterServices(updatedMasters);
        setServices(services.filter(s => s.name !== name));
    };

    const handleSave = () => {
        // Generate sequential invoice number
        const existingNotes = dataService.getHonoraryNotes();
        const currentYear = new Date().getFullYear();
        const notesThisYear = existingNotes.filter(n => n.date.startsWith(currentYear.toString()));
        const invoiceNumber = `${currentYear}-${String(notesThisYear.length + 1).padStart(4, '0')}`;

        const note: HonoraryNote = {
            id: Date.now().toString(),
            patientId: patient.id,
            patientName: patient.name,
            patientPhone: patient.phone || undefined,
            patientCin: undefined, // Can be added manually if needed
            visitId,
            date,
            invoiceNumber,
            services: services.filter(s => s.checked || s.price! > 0),
            totalAmount: total,
            totalInWords: totalWords,
            status,
            paymentMode
        };

        dataService.saveHonoraryNote(note);
        setSavedNote(note);
        setIsPreview(true);
        window.dispatchEvent(new Event('meddoc_data_update'));
    };

    const handleExportPDF = async () => {
        if (!savedNote) return;
        const element = document.getElementById('note-pdf-export');
        if (!element) return;

        const opt = {
            margin: 0,
            filename: `Note_Honoraires_${patient.name}_${savedNote.invoiceNumber}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
            pagebreak: { mode: 'avoid-all' }
        };

        toastService.info("Génération de la note PDF...");
        const html2pdf = (await import('html2pdf.js')).default;
        html2pdf()
            .set(opt)
            .from(element)
            .save()
            .then(() => {
                toastService.success("Note enregistrée avec succès !");
            })
            .catch((err: any) => {
                console.error("PDF Export Error:", err);
                toastService.error("Erreur lors de l'export PDF.");
            });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shadow-inner">
                            <Wallet size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-gray-900">Note d'Honoraires</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">{patient.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Form Side */}
                    <div className={`flex-1 overflow-y-auto p-8 scrollbar-thin ${isPreview ? 'hidden lg:block lg:w-1/2' : 'w-full'}`}>
                        <div className="space-y-8">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">Date</label>
                                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                        className="w-full p-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">Mode de Paiement</label>
                                    <select value={paymentMode} onChange={e => setPaymentMode(e.target.value as any)}
                                        className="w-full p-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all">
                                        <option value="CASH">Espèces (Cash)</option>
                                        <option value="CARD">Carte Bancaire</option>
                                        <option value="TRANSFER">Virement</option>
                                    </select>
                                </div>
                            </div>

                            {/* Services List */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pl-2">
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <Check size={14} className="text-blue-500" /> Prestations réalisées
                                    </h3>
                                    <button onClick={() => setIsAddingNewMaster(true)} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all">
                                        <Plus size={12} /> Nouveau Service
                                    </button>
                                </div>

                                {isAddingNewMaster && (
                                    <div className="bg-blue-50/50 p-4 rounded-2xl border-2 border-dashed border-blue-200 space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="text" placeholder="Nom du service (ex: ECG)" value={newServiceName} onChange={e => setNewServiceName(e.target.value)}
                                                className="p-2 bg-white border border-blue-100 rounded-xl text-xs font-bold outline-none" />
                                            <input type="number" placeholder="Prix (DH)" value={newServicePrice || ''} onChange={e => setNewServicePrice(parseFloat(e.target.value) || 0)}
                                                className="p-2 bg-white border border-blue-100 rounded-xl text-xs font-bold outline-none" />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setIsAddingNewMaster(false)} className="text-[10px] font-black uppercase text-gray-400">Annuler</button>
                                            <button onClick={handleAddMaster} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">Ajouter</button>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-3">
                                    {services.map((service, index) => {
                                        const master = masterServices.find(m => m.name === service.name);
                                        return (
                                            <div key={index} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${service.checked ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                                <button onClick={() => toggleService(index)} className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${service.checked ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 border border-gray-200 text-transparent'}`}>
                                                    <Check size={14} />
                                                </button>

                                                <div className="flex-1 flex flex-col">
                                                    <span className={`text-sm font-bold ${service.checked ? 'text-blue-900' : 'text-gray-500'}`}>{service.name}</span>
                                                    {!service.checked && master && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteMaster(master.id, master.name);
                                                            }}
                                                            className="text-[8px] font-black text-red-300 uppercase hover:text-red-500 transition-all w-fit mt-1"
                                                        >
                                                            Supprimer du modèle
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 p-1 shadow-sm">
                                                    <input
                                                        type="number"
                                                        placeholder="0"
                                                        value={service.price || ''}
                                                        onChange={e => updatePrice(index, parseFloat(e.target.value) || 0)}
                                                        className="w-20 bg-transparent text-right font-black text-sm text-gray-900 outline-none pr-1"
                                                    />
                                                    <span className="text-[10px] font-black text-gray-300 pr-2">DH</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Total à facturer (Editable) */}
                            <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                                <div className="relative">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">Total à facturer (Modifiable)</p>
                                    <div className="flex items-baseline gap-2">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={total}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setTotal(val);
                                                setTotalWords(formatCurrencyToWords(val, 'Dirhams'));
                                            }}
                                            className="bg-transparent border-b-2 border-white/20 focus:border-white outline-none text-4xl font-black w-48 transition-all"
                                        />
                                        <span className="text-lg font-bold opacity-80">{doctor.currency || 'DH'}</span>
                                    </div>
                                    <p className="mt-4 text-[11px] font-bold italic border-t border-white/20 pt-4 leading-relaxed">
                                        {totalWords}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-4 bg-white text-blue-600 border-2 border-blue-600 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-50 transition-all flex items-center justify-center gap-3"
                                >
                                    <Save size={18} /> Enregistrer
                                </button>
                                <button
                                    onClick={() => {
                                        handleSave();
                                        setTimeout(() => window.print(), 500);
                                    }}
                                    className="flex-1 py-4 bg-blue-50 text-blue-600 border border-blue-200 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center justify-center gap-3"
                                >
                                    <Printer size={18} /> Imprimer
                                </button>
                                <button
                                    onClick={() => {
                                        handleSave();
                                        setTimeout(handleExportPDF, 500);
                                    }}
                                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
                                >
                                    <Save size={18} /> Enregistrer en PDF
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Preview Side */}
                    {isPreview && (
                        <div className="flex-1 bg-gray-100 overflow-y-auto p-8 flex flex-col items-center gap-6 animate-in slide-in-from-right-8">
                            <div className="sticky top-0 w-full z-10 flex justify-center gap-4 mb-4">
                                <button
                                    onClick={() => setIsPreview(false)}
                                    className="px-6 py-3 bg-white text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg border border-gray-200"
                                >
                                    Modifier
                                </button>
                                <button
                                    onClick={handleExportPDF}
                                    className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2"
                                >
                                    <Save size={16} /> Enregistrer PDF
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="px-8 py-3 bg-gray-100 text-gray-700 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-2"
                                >
                                    <Printer size={16} /> Imprimer
                                </button>
                            </div>

                            <div className="shadow-2xl aspect-[1/1.41] w-full max-w-[500px] rounded-[2rem] overflow-hidden bg-white border border-gray-100 flex justify-center items-start shrink-0 print:m-0 print:shadow-none print:w-auto print:h-auto print:max-w-none">
                                <div className="print:block">
                                    <HonoraryNoteTemplate doctor={doctor} note={savedNote!} scale={0.45} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden Export Layer */}
                <div className="opacity-0 pointer-events-none fixed -left-[5000px]">
                    {savedNote && (
                        <div id="note-pdf-export" style={{ width: '2480px', height: '3508px', background: 'white' }}>
                            <HonoraryNoteTemplate doctor={doctor} note={savedNote} isPrinting={true} scale={0.32} />
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default HonoraryNoteEditor;

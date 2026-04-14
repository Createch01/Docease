
import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Printer, FileText, Calendar, Clock, ChevronRight } from 'lucide-react';
import { dataService } from '../services/dataService';
import { MedicalCertificate, Patient, CertificateType } from '../types';
import { settingsService } from '../services/settingsService';
import { toastService } from '../services/toastService';
import MedicalCertificateTemplate from './MedicalCertificateTemplate';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface MedicalCertificateEditorProps {
    patient: Patient;
    onClose: () => void;
}

const CERTIFICATE_TYPES: { id: CertificateType; label: string; defaultContent: string }[] = [
    {
        id: 'REPOS',
        label: 'Certificat de Repos',
        defaultContent: 'L\'état de santé de l\'intéressé(e) nécessite un repos médical de :'
    },
    {
        id: 'APTITUDE',
        label: 'Certificat d\'Aptitude',
        defaultContent: 'L\'examen clinique de ce jour ne révèle aucun signe clinique apparent de contre-indication à la pratique de :'
    },
    {
        id: 'PROLONGATION',
        label: 'Prolongation de Repos',
        defaultContent: 'L\'état de santé de l\'intéressé(e) nécessite une prolongation du repos médical précédemment prescrit.'
    },
    {
        id: 'CUSTOM',
        label: 'Certificat Personnalisé',
        defaultContent: ''
    }
];

const MedicalCertificateEditor: React.FC<MedicalCertificateEditorProps> = ({ patient, onClose }) => {
    const doctor = dataService.getDoctorInfo();
    const appearance = settingsService.getAppearance();

    const [cert, setCert] = useState<Partial<MedicalCertificate>>({
        id: Date.now().toString(),
        patientId: patient.id,
        patientName: patient.name,
        date: new Date().toLocaleDateString('fr-FR'),
        type: 'REPOS',
        content: CERTIFICATE_TYPES[0].defaultContent,
        duration: 3,
        startDate: new Date().toLocaleDateString('fr-FR')
    });

    const [isPreview, setIsPreview] = useState(false);

    const handleTypeChange = (type: CertificateType) => {
        const typeInfo = CERTIFICATE_TYPES.find(t => t.id === type);
        setCert({
            ...cert,
            type,
            content: typeInfo?.defaultContent || ''
        });
    };

    const handleSave = () => {
        if (!cert.content) {
            toastService.warning("Veuillez remplir le contenu du certificat.");
            return;
        }
        dataService.saveMedicalCertificate(cert as MedicalCertificate);
        toastService.success("Certificat enregistré avec succès !");
        setIsPreview(true);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportPDF = () => {
        const element = document.getElementById('cert-pdf-export');
        if (!element) return;

        const opt = {
            margin: 0,
            filename: `Certificat_${patient.name}_${new Date().toLocaleDateString()}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
            pagebreak: { mode: 'avoid-all' }
        };

        toastService.info("Génération du certificat PDF...");
        html2pdf()
            .set(opt)
            .from(element)
            .save()
            .then(() => {
                toastService.success("Certificat enregistré avec succès !");
            })
            .catch((err: any) => {
                console.error("PDF Export Error:", err);
                toastService.error("Erreur lors de l'export PDF.");
            });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-gray-900">Certificat Médical Professionnel</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">{patient.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Form Side */}
                    <div className={`flex-1 overflow-y-auto p-8 border-r border-gray-50 ${isPreview ? 'hidden lg:block' : 'block'}`}>
                        <div className="space-y-8">
                            {/* Type Selection */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {CERTIFICATE_TYPES.map(type => (
                                    <button
                                        key={type.id}
                                        onClick={() => handleTypeChange(type.id)}
                                        className={`p-4 rounded-2xl border-2 transition-all text-center flex flex-col items-center gap-2 ${cert.type === type.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-lg' : 'border-gray-100 hover:border-gray-200 text-gray-400'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cert.type === type.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                                            <FileText size={20} />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-tight">{type.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">Date du certificat</label>
                                    <input
                                        type="text"
                                        value={cert.date}
                                        onChange={e => setCert({ ...cert, date: e.target.value })}
                                        className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all"
                                    />
                                </div>
                                {cert.type === 'REPOS' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">Durée du repos (jours)</label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                value={cert.duration || ''}
                                                onChange={e => setCert({ ...cert, duration: parseInt(e.target.value) || 0 })}
                                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/5"
                                            />
                                            <input
                                                type="text"
                                                value={cert.startDate}
                                                onChange={e => setCert({ ...cert, startDate: e.target.value })}
                                                placeholder="Date début"
                                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/5"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">Contenu du certificat</label>
                                <textarea
                                    value={cert.content}
                                    onChange={e => setCert({ ...cert, content: e.target.value })}
                                    placeholder="Rédigez ici le contenu du certificat..."
                                    className="w-full h-64 p-6 bg-gray-50 border border-gray-100 rounded-[2rem] font-bold text-lg outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all resize-none"
                                />
                            </div>

                            <button
                                onClick={handleSave}
                                className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all"
                            >
                                <Save size={20} /> Enregistrer & Prévisualiser
                            </button>
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
                                    onClick={handlePrint}
                                    className="px-8 py-3 bg-white text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg border border-gray-200"
                                >
                                    <Printer size={16} /> Imprimer
                                </button>
                            </div>

                            <div className="shadow-2xl aspect-[1/1.41] w-full max-w-[500px] rounded-[2rem] overflow-hidden bg-white border border-gray-100 flex justify-center items-start shrink-0">
                                <div style={{ transform: 'scale(0.145)', transformOrigin: 'top center', width: '2480px', height: '3508px' }}>
                                    <MedicalCertificateTemplate
                                        doctor={doctor}
                                        appearance={appearance}
                                        certificate={cert as MedicalCertificate}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden Export Layer */}
                <div className="opacity-0 pointer-events-none fixed -left-[5000px]">
                    <div id="cert-pdf-export" style={{ width: '2480px', height: '3508px', background: 'white' }}>
                        <MedicalCertificateTemplate
                            doctor={doctor}
                            appearance={appearance}
                            certificate={cert as MedicalCertificate}
                            isPrinting={true}
                            scale={0.32}
                        />
                    </div>
                </div>

                {/* Print Hidden Layer */}
                <div className="hidden print:block fixed inset-0 z-[9999] bg-white">
                    <MedicalCertificateTemplate
                        doctor={doctor}
                        appearance={appearance}
                        certificate={cert as MedicalCertificate}
                        isPrinting={true}
                    />
                </div>
            </div>
        </div>
    );
};

export default MedicalCertificateEditor;

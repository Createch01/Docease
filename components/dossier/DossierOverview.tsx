import React, { useMemo } from 'react';
import { FileText, Wallet, Activity, Filter, AlertCircle, Syringe, Pill, History, HeartPulse, Scale, Ruler, Wind, Thermometer, CalendarRange } from 'lucide-react';
import { useI18n } from '../../i18n';
import { dataService } from '../../services/dataService';
import { vaccinationService } from '../../services/vaccinationService';
import { timelineService, TimelineEvent } from '../../services/timelineService';
import { HonoraryNote, Prescription } from '../../types';
import PatientTimeline from './PatientTimeline';
import { EMPTY_STATES } from '../../constants/emptyStates';
import { formatDate } from '../../utils/formatters';
import { getActiveTreatment } from '../../utils/activeTreatment';

interface DossierOverviewProps {
    patientId: string;
    patientName: string;
    refreshTrigger: number;
    onNavigate: (tab: any) => void;
    onPreviewNote: (note: HonoraryNote) => void;
    onPreviewPrescription: (rx: Prescription) => void;
}

const DossierOverview: React.FC<DossierOverviewProps> = ({
    patientId,
    patientName,
    refreshTrigger,
    onNavigate,
    onPreviewNote,
    onPreviewPrescription
}) => {
    const { t, dir } = useI18n();
    const patient = useMemo(() => dataService.getPatientProfile(patientId), [patientId, refreshTrigger]);
    const consultations = useMemo(() => dataService.getConsultations(patientId), [patientId, refreshTrigger]);
    const prescriptions = useMemo(() => dataService.getPrescriptions().filter(p => p.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date)), [patientId, refreshTrigger]);
    const labRequests = useMemo(() => dataService.getLabRequests(patientId), [patientId, refreshTrigger]);
    const honoraryNotes = useMemo(() => dataService.getHonoraryNotes(patientId), [patientId, refreshTrigger]);
    const results = useMemo(() => dataService.getMedicalResults(patientId), [patientId, refreshTrigger]);
    const timeline = useMemo(() => timelineService.getPatientTimeline(patientId), [patientId, refreshTrigger]);

    // Active treatment = most recent prescription still within its longest item duration
    const activeTreatment = useMemo(() => getActiveTreatment(prescriptions), [prescriptions]);

    const patientAppointments = useMemo(() => {
        const all = dataService.getAppointments();
        return all
            .filter(a => (a.patientId === patientId || a.patientName === patientName) && a.status !== 'REJECTED')
            .sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
    }, [patientId, patientName, refreshTrigger]);

    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingAppointments = useMemo(() => patientAppointments.filter(a => a.date >= todayStr), [patientAppointments]);
    const pastAppointments = useMemo(() => [...patientAppointments].filter(a => a.date < todayStr).reverse(), [patientAppointments]);

    const APPT_STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Planifié', ARRIVED: 'Arrivé', IN_CONSULTATION: 'En consultation', DONE: 'Terminé' };

    const latestVital = useMemo(() => {
        const history = [...(patient?.vitalSigns || [])].sort((a, b) => a.date.localeCompare(b.date));
        return history[history.length - 1] || null;
    }, [patient, refreshTrigger]);

    const nextVaccineDue = useMemo(() => {
        if (!patient) return null;
        const status = vaccinationService.getVaccinationStatus(patient);
        return status.find(s => s.status === 'DUE' || s.status === 'OVERDUE') || null;
    }, [patient, refreshTrigger]);

    const handleTimelineSelect = (ev: TimelineEvent) => {
        if (ev.type === 'invoice') {
            const note = honoraryNotes.find(n => n.id === ev.refId);
            if (note) { onPreviewNote(note); return; }
        }
        if (ev.type === 'prescription') {
            const rx = prescriptions.find(p => p.id === ev.refId);
            if (rx) { onPreviewPrescription(rx); return; }
        }
        onNavigate(ev.sourceTab);
    };

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-500">
            {/* Clinical alert cards — real data, priority visual. Financial info (debt) */}
            {/* deliberately lives outside this row: clinical urgency should never compete */}
            {/* visually with a billing balance. See "Secondary counters" below. */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`p-5 rounded-[1.5rem] border ${patient?.allergies ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 ${patient?.allergies ? 'text-red-500' : 'text-gray-400'}`}>
                        <AlertCircle size={12} /> Allergies
                    </p>
                    <p className={`text-xs font-bold ${patient?.allergies ? 'text-red-700' : 'text-gray-400'}`}>
                        {patient?.allergies || EMPTY_STATES.allergies}
                    </p>
                </div>
                <div className={`p-5 rounded-[1.5rem] border ${patient?.chronicDiseases?.length ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 ${patient?.chronicDiseases?.length ? 'text-amber-600' : 'text-gray-400'}`}>
                        <Activity size={12} /> Maladies chroniques
                    </p>
                    <p className={`text-xs font-bold ${patient?.chronicDiseases?.length ? 'text-amber-800' : 'text-gray-400'}`}>
                        {patient?.chronicDiseases?.length ? patient.chronicDiseases.join(', ') : EMPTY_STATES.chronicDiseases}
                    </p>
                </div>
                <div className={`p-5 rounded-[1.5rem] border ${activeTreatment ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 ${activeTreatment ? 'text-blue-600' : 'text-gray-400'}`}>
                        <Pill size={12} /> Traitement en cours
                    </p>
                    <p className={`text-xs font-bold ${activeTreatment ? 'text-blue-800' : 'text-gray-400'}`}>
                        {activeTreatment ? activeTreatment.items.map(i => i.medicineName).join(', ') : EMPTY_STATES.activeTreatment}
                    </p>
                </div>
                <div className={`p-5 rounded-[1.5rem] border ${nextVaccineDue ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 ${nextVaccineDue ? 'text-rose-600' : 'text-gray-400'}`}>
                        <Syringe size={12} /> Vaccination due
                    </p>
                    <p className={`text-xs font-bold ${nextVaccineDue ? 'text-rose-800' : 'text-gray-400'}`}>
                        {nextVaccineDue ? nextVaccineDue.vaccine.name : 'À jour'}
                    </p>
                </div>
            </div>

            {/* Secondary counters — activity only; billing balance lives in the Facture tab, */}
            {/* never duplicated here so clinical/overview never doubles as a billing view. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('consultations')}</p>
                    <h4 className="text-2xl font-black text-gray-900">{consultations.length}</h4>
                </div>
                <div className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('prescriptions')}</p>
                    <h4 className="text-2xl font-black text-gray-900">{prescriptions.length}</h4>
                </div>
                <div className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Notes d'honoraires</p>
                    <h4 className="text-2xl font-black text-gray-900">{honoraryNotes.length}</h4>
                </div>
            </div>

            {/* Rendez-vous du patient */}
            {(upcomingAppointments.length > 0 || pastAppointments.length > 0) && (
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            <CalendarRange size={14} /> Rendez-vous
                        </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">À venir</p>
                            {upcomingAppointments.length > 0 ? (
                                <div className="space-y-2">
                                    {upcomingAppointments.slice(0, 3).map(a => (
                                        <div key={a.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                                            <span className="text-[11px] font-bold text-gray-700">{formatDate(a.date)}{a.time ? ` · ${a.time}` : ''}</span>
                                            <span className="text-[9px] font-black text-emerald-600 uppercase">{APPT_STATUS_LABEL[a.status] || a.status}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[11px] font-semibold text-gray-300">Aucun RDV planifié.</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Passés</p>
                            {pastAppointments.length > 0 ? (
                                <div className="space-y-2">
                                    {pastAppointments.slice(0, 3).map(a => (
                                        <div key={a.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                                            <span className="text-[11px] font-bold text-gray-700">{formatDate(a.date)}{a.time ? ` · ${a.time}` : ''}</span>
                                            <span className="text-[9px] font-black text-gray-400 uppercase">{APPT_STATUS_LABEL[a.status] || a.status}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[11px] font-semibold text-gray-300">Aucun historique.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Dernières constantes vitales */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <HeartPulse size={14} /> Constantes vitales
                    </h4>
                    <button onClick={() => onNavigate('constantes')} className="text-[10px] font-black text-emerald-600 uppercase hover:underline">Voir le suivi</button>
                </div>
                {latestVital ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {latestVital.weight !== undefined && (
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1 mb-1"><Scale size={10} />Poids</p>
                                <p className="text-sm font-black text-gray-800">{latestVital.weight} kg</p>
                            </div>
                        )}
                        {latestVital.height !== undefined && (
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1 mb-1"><Ruler size={10} />Taille</p>
                                <p className="text-sm font-black text-gray-800">{latestVital.height} cm</p>
                            </div>
                        )}
                        {(latestVital.systolic !== undefined || latestVital.diastolic !== undefined) && (
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1 mb-1"><HeartPulse size={10} />Tension</p>
                                <p className="text-sm font-black text-gray-800">{latestVital.systolic ?? '—'}/{latestVital.diastolic ?? '—'}</p>
                            </div>
                        )}
                        {latestVital.spO2 !== undefined && (
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1 mb-1"><Wind size={10} />SpO2</p>
                                <p className="text-sm font-black text-gray-800">{latestVital.spO2} %</p>
                            </div>
                        )}
                        {latestVital.temperature !== undefined && (
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1 mb-1"><Thermometer size={10} />Temp.</p>
                                <p className="text-sm font-black text-gray-800">{latestVital.temperature} °C</p>
                            </div>
                        )}
                        <div className="col-span-2 md:col-span-5">
                            <p className="text-[9px] font-semibold text-gray-300 mt-1">Mesuré le {formatDate(latestVital.date)}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-[11px] font-semibold text-gray-400">Aucune constante enregistrée.</p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Unified chronological timeline */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[500px]">
                    <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><History size={14} /> Historique du patient</h4>
                        <span className="text-[10px] font-black text-gray-400">{timeline.length} événement{timeline.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex-1 p-5 overflow-y-auto scrollbar-thin">
                        <PatientTimeline events={timeline} onSelect={handleTimelineSelect} />
                    </div>
                </div>

                {/* Latest Prescription */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[500px]">
                    <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">{t('latest_prescription')}</h4>
                        <button onClick={() => onNavigate('ordonnance')} className="text-[10px] font-black text-emerald-600 uppercase hover:underline">{t('view_all')}</button>
                    </div>
                    <div className="flex-1 p-6 overflow-hidden">
                        {prescriptions.length > 0 ? (
                            <div className="h-full flex flex-col">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-3 py-1 rounded-full uppercase italic">{formatDate(prescriptions[0].date)}</span>
                                    <FileText size={20} className="text-emerald-500" />
                                </div>
                                <div className="space-y-2 flex-1 overflow-y-auto pr-2 scrollbar-thin">
                                    {prescriptions[0].items.map((item, idx) => (
                                        <div key={idx} className="p-3 bg-gray-50 rounded-xl flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            <span className="text-xs font-bold text-gray-700 uppercase">{item.medicineName}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => onPreviewPrescription(prescriptions[0])}
                                    className="mt-4 w-full py-3 bg-emerald-50 text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all"
                                >
                                    {t('open_prescription')}
                                </button>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-20">
                                <FileText size={48} />
                                <p className="mt-2 text-[10px] font-black uppercase">{t('no_prescriptions')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Mini Observations & Lab Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-emerald-50/30 rounded-[2.5rem] border border-emerald-100/50 p-8">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={16} /> {t('latest_observations')}
                        </h4>
                        <button onClick={() => onNavigate('consultation')} className="text-[10px] font-black text-emerald-600 uppercase hover:underline">{t('view_history')}</button>
                    </div>
                    {consultations.length > 0 ? (
                        <div className="space-y-4">
                            <div>
                                <p className="text-[9px] font-black text-emerald-400 uppercase mb-2">Motif & symptômes</p>
                                <p className="text-sm font-bold text-gray-800 leading-relaxed italic">"{consultations[0].motif}"</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-emerald-400 uppercase mb-2">Diagnostic / Plan</p>
                                <p className="text-sm font-black text-emerald-700 mb-1">{consultations[0].diagnostic || "N/A"}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-center text-[10px] font-black text-gray-300 uppercase py-4">{t('no_patients')}</p>
                    )}
                </div>

                <div className="bg-amber-50/20 rounded-[2.5rem] border border-amber-100/50 p-8 flex flex-col h-[350px]">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                            <Filter size={16} /> {t('bilan_results')}
                        </h4>
                        <div className="flex gap-3">
                            <button onClick={() => onNavigate('analyses')} className="text-[10px] font-black text-amber-600 uppercase hover:underline">{t('analyses')}</button>
                            <button onClick={() => onNavigate('resultats')} className="text-[10px] font-black text-blue-600 uppercase hover:underline">{t('results')}</button>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 scrollbar-thin">
                        {/* 1. Pending Lab Requests (Analyses) */}
                        {labRequests.filter(l => l.status === 'REQUESTED').length > 0 && (
                            <div className="space-y-2 mb-4">
                                <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">{t('pending_requests')} ({labRequests.filter(l => l.status === 'REQUESTED').length})</p>
                                {labRequests.filter(l => l.status === 'REQUESTED').slice(0, 3).map((req, i) => (
                                    <div key={i} className={`flex justify-between items-center p-3 bg-white rounded-xl border border-amber-50 shadow-sm ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                        <span className={`text-[10px] font-black text-gray-700 uppercase truncate flex-1 ${dir === 'rtl' ? 'ml-2 text-right' : 'mr-2 text-left'}`}>{req.title}</span>
                                        <span className="text-[8px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md uppercase whitespace-nowrap">{t('to_do')}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 2. Recent Medical Results */}
                        {results.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Derniers Résultats</p>
                                {results.slice(0, 3).map((res, i) => (
                                    <div key={i} className="p-3 bg-white rounded-xl border border-blue-50 shadow-sm">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-black text-gray-900 uppercase truncate">{res.title}</span>
                                            <span className="text-[8px] font-black text-gray-400 uppercase italic">{res.date}</span>
                                        </div>
                                        <p className="text-[9px] font-bold text-gray-500 line-clamp-1 italic">"{res.interpretation}"</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {labRequests.filter(l => l.status === 'REQUESTED').length === 0 && results.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center opacity-30">
                                <Filter size={32} />
                                <p className="text-[10px] font-black uppercase mt-2">{t('no_biological_data')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DossierOverview;

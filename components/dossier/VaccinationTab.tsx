import React, { useState, useEffect } from 'react';
import { Patient, VaccinationRecord, Vaccine } from '../../types';
import { vaccinationService } from '../../services/vaccinationService';
import { CheckCircle, AlertCircle, Clock, Calendar, Syringe, Save, Trash2, Printer, X } from 'lucide-react';
import { useI18n } from '../../i18n';

interface VaccinationTabProps {
    patient: Patient;
}

type ScheduleItem = { vaccine: Vaccine, record?: VaccinationRecord, status: string };

const VaccinationTab: React.FC<VaccinationTabProps> = ({ patient }) => {
    const { t, lang, dir } = useI18n();
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDate, setEditDate] = useState<string>('');
    const [editBatch, setEditBatch] = useState<string>('');

    useEffect(() => {
        loadSchedule();
        window.addEventListener('meddoc_data_update', loadSchedule);
        return () => window.removeEventListener('meddoc_data_update', loadSchedule);
    }, [patient.id]);

    const loadSchedule = () => {
        const allVaccines = vaccinationService.getSchedule();
        const records = vaccinationService.getPatientRecords(patient.id);

        // Simple age calculation (in months)
        const patientAgeMonths = (patient.age || 0) * 12;

        const mapped: ScheduleItem[] = allVaccines.map(v => {
            const record = records.find(r => r.vaccineId === v.id);
            let status = 'UPCOMING';

            if (record) {
                status = 'DONE';
            } else if (patientAgeMonths > v.targetAgeMonths + 2) {
                status = 'OVERDUE';
            } else if (patientAgeMonths >= v.targetAgeMonths) {
                status = 'DUE';
            }

            return { vaccine: v, record, status };
        });

        setSchedule(mapped);
    };

    const handleSave = (vaccineId: string) => {
        if (!editDate) return;

        const record: VaccinationRecord = {
            id: Date.now().toString(),
            patientId: patient.id,
            vaccineId: vaccineId,
            dateAdministered: editDate,
            batchNumber: editBatch,
            status: 'DONE'
        };

        vaccinationService.saveRecord(record);
        setEditingId(null);
        setEditBatch('');
        setEditDate('');
    };

    const handleDelete = (vaccineId: string) => {
        if (confirm(t('delete_vaccination_confirm'))) {
            vaccinationService.deleteRecord(patient.id, vaccineId);
        }
    };

    const startEdit = (v: Vaccine) => {
        setEditingId(v.id);
        setEditDate(new Date().toISOString().split('T')[0]);
    };

    // Group by Age
    const grouped = schedule.reduce((acc, item) => {
        const age = item.vaccine.targetAgeMonths;
        const label = age === 0 ? t('birth') :
            age < 12 ? `${age} ${t('month')}` :
                age === 12 ? `1 ${t('year')}` :
                    age < 24 ? `${age} ${t('month')}` : `${age / 12} ${t('years')}`;

        if (!acc[label]) acc[label] = [];
        acc[label].push(item);
        return acc;
    }, {} as Record<string, ScheduleItem[]>);

    return (
        <div className="h-full flex flex-col gap-6 animate-in fade-in duration-300 p-2">

            {/* Header / Config */}
            <div className={`flex justify-between items-center bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                        <Syringe size={20} />
                    </div>
                    <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                        <h3 className="text-sm font-black uppercase text-emerald-900">{t('vaccination_schedule')}</h3>
                        <p className="text-[10px] text-emerald-600 font-bold">{t('national_immunization_program')}</p>
                    </div>
                </div>
                {/* Print Button Wrapper */}
                <button onClick={() => window.print()} className="p-2 bg-white text-emerald-600 rounded-xl border border-emerald-100 shadow-sm hover:shadow-md transition-all">
                    <Printer size={18} />
                </button>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-10">
                {(Object.entries(grouped) as [string, ScheduleItem[]][]).map(([ageLabel, items]) => (
                    <div key={ageLabel} className={`relative border-dashed border-gray-200 ml-4 ${dir === 'rtl' ? 'pr-6 border-r-2 mr-4 ml-0' : 'pl-6 border-l-2'}`}>
                        {/* Age Marker */}
                        <div className={`absolute top-0 w-8 h-8 rounded-full bg-white border-4 border-emerald-100 text-[10px] font-black flex items-center justify-center text-emerald-600 shadow-sm ${dir === 'rtl' ? '-right-[17px]' : '-left-[17px]'}`}>
                            {items[0].vaccine.targetAgeMonths}
                        </div>

                        <div className={`mb-2 ${dir === 'rtl' ? 'pr-2 text-right' : 'pl-2 text-left'}`}>
                            <span className="text-xs font-black uppercase bg-gray-100 text-gray-500 px-3 py-1 rounded-full">{ageLabel}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                            {items.map(({ vaccine, record, status }) => (
                                <div key={vaccine.id}
                                    className={`
                                        p-4 rounded-2xl border transition-all relative overflow-hidden group
                                        ${status === 'DONE' ? 'bg-emerald-50/50 border-emerald-200' :
                                            status === 'OVERDUE' ? 'bg-red-50/50 border-red-200' :
                                                status === 'DUE' ? 'bg-amber-50/50 border-amber-200 shadow-md' : 'bg-white border-gray-100 opacity-80'}
                                    `}
                                >
                                    <div className={`flex justify-between items-start mb-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                        <h4 className={`font-black text-sm uppercase text-gray-800 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{vaccine.name}</h4>
                                        {status === 'DONE' && <CheckCircle size={16} className="text-emerald-500" />}
                                        {status === 'OVERDUE' && <AlertCircle size={16} className="text-red-500 animate-pulse" />}
                                        {status === 'DUE' && <Clock size={16} className="text-amber-500" />}
                                    </div>

                                    <p className={`text-[10px] text-gray-500 font-medium leading-tight mb-3 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                        {vaccine.diseasePrevented}
                                    </p>

                                    {/* Action Area */}
                                    <div className="mt-auto">
                                        {record ? (
                                            <div className={`flex justify-between items-end ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                                <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{t('done_on')}</p>
                                                    <p className="text-xs font-black text-emerald-700">{new Date(record.dateAdministered).toLocaleDateString()}</p>
                                                    {record.batchNumber && <p className="text-[9px] text-gray-400">{t('batch')}: {record.batchNumber}</p>}
                                                </div>
                                                <button onClick={() => handleDelete(vaccine.id)} className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ) : editingId === vaccine.id ? (
                                            <div className="bg-white p-2 rounded-xl border border-emerald-100 shadow-sm animate-in zoom-in-95">
                                                <input
                                                    type="date"
                                                    value={editDate}
                                                    onChange={e => setEditDate(e.target.value)}
                                                    className={`w-full text-xs p-1 mb-2 border-b border-gray-200 outline-none font-bold ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder={t('batch_number_optional')}
                                                    value={editBatch}
                                                    onChange={e => setEditBatch(e.target.value)}
                                                    className={`w-full text-[10px] p-1 mb-2 bg-gray-50 rounded border-none outline-none ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                                                />
                                                <div className={`flex gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                                    <button onClick={() => handleSave(vaccine.id)} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1 rounded-lg text-[10px] font-black">{t('validate')}</button>
                                                    <button onClick={() => setEditingId(null)} className="px-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg text-[10px]"><X size={12} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => startEdit(vaccine)}
                                                className={`
                                                    w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all
                                                    ${status === 'OVERDUE' || status === 'DUE' ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200' : 'bg-gray-100 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'}
                                                    ${dir === 'rtl' ? 'flex-row-reverse' : ''}
                                                `}
                                            >
                                                <Syringe size={12} />
                                                {t('mark_as_done')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VaccinationTab;

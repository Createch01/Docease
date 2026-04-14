
import React, { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCircle2, Info, AlertTriangle, AlertOctagon, ArrowRight, Syringe } from 'lucide-react';
import { dataService } from '../services/dataService';
import { vaccinationService } from '../services/vaccinationService';
import { Appointment, Notification, Patient } from '../types';

interface NotificationCenterProps {
    onNavigate?: (view: string, data?: any) => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onNavigate }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [urgentAppointments, setUrgentAppointments] = useState<Appointment[]>([]);

    useEffect(() => {
        const loadNotifications = () => {
            const newNotifications: Notification[] = [];

            // 1. Check Overdue Vaccinations
            const patients = dataService.getAllPatients();
            patients.forEach(patient => {
                const status = vaccinationService.getVaccinationStatus(patient);
                const overdue = status.filter(s => s.status === 'OVERDUE');

                overdue.forEach(item => {
                    newNotifications.push({
                        id: `vac-${patient.id}-${item.vaccine.id}`,
                        type: 'warning',
                        title: `Vaccin En Retard: ${item.vaccine.name}`,
                        message: `${patient.name} doit recevoir ce vaccin (Retard > 2 mois).`,
                        time: 'Urgent',
                        actionLink: 'dossier',
                        patientId: patient.id,
                        isRead: false
                    });
                });
            });

            // 2. Add System Notifications (Mock for now, can be real later)
            newNotifications.push({
                id: 'sys-1',
                type: 'info',
                title: 'Mise à jour système',
                message: 'DocEase v1.0 est prêt.',
                time: 'Il y a 5 min',
                isRead: true
            });

            setNotifications(newNotifications);
        };

        const loadUrgentAppointments = () => {
            const allAppointments = dataService.getAppointments();
            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

            const urgent = allAppointments.filter(app =>
                app.priority === 'URGENT' &&
                (app.date === today || app.date === tomorrow)
            );
            setUrgentAppointments(urgent);
        };

        loadNotifications();
        loadUrgentAppointments();

        const handleUpdate = (e: any) => {
            if (e.detail?.key === 'meddoc_appointments' || e.detail?.key === 'meddoc_patients') {
                loadNotifications();
                loadUrgentAppointments();
            }
        };
        window.addEventListener('meddoc_data_update', handleUpdate as EventListener);
        return () => window.removeEventListener('meddoc_data_update', handleUpdate as EventListener);
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="text-emerald-500" size={20} />;
            case 'warning': return <AlertTriangle className="text-amber-500" size={20} />;
            case 'date': return <AlertOctagon className="text-red-500" size={20} />;
            default: return <Info className="text-blue-500" size={20} />;
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-emerald-900 tracking-tight flex items-center gap-3">
                        <Bell className="text-emerald-600" size={32} />
                        Centre de Notifications
                    </h2>
                    <p className="text-emerald-700/60 font-bold uppercase tracking-widest text-[10px] mt-1">
                        Restez informé des activités du cabinet
                    </p>
                </div>
                <button className="px-6 py-2 bg-white border border-emerald-100 text-emerald-700 font-bold rounded-xl hover:bg-emerald-50 transition-colors text-xs uppercase tracking-widest">
                    Tout marquer comme lu
                </button>
            </div>

            {/* URGENT APPOINTMENTS */}
            {urgentAppointments.length > 0 && (
                <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 animate-in slide-in-from-top-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-100 rounded-xl text-red-600 animate-pulse">
                            <AlertOctagon size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-red-800 uppercase tracking-tight">Rendez-vous Urgents</h3>
                            <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-widest">Action requise Aujourd'hui ou Demain</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {urgentAppointments.map(app => (
                            <div key={app.id} className="bg-white p-4 rounded-2xl border-l-4 border-red-500 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <span className="font-black text-gray-900 uppercase">{app.patientName}</span>
                                    <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded-md">URGENT</span>
                                </div>
                                <p className="text-xs text-gray-500 font-medium line-clamp-2">{app.note}</p>
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-[10px] font-bold text-gray-400">{app.date}</span>
                                    {onNavigate && (
                                        <button onClick={() => onNavigate('appointments')} className="text-blue-500 hover:text-blue-700">
                                            <ArrowRight size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* GENERAL NOTIFICATIONS */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 bg-gray-50/30">
                    <h3 className="font-black text-emerald-900 uppercase tracking-tight flex items-center gap-2">
                        <Info size={18} className="text-emerald-500" />
                        Activités Récentes
                    </h3>
                </div>
                <div className="divide-y divide-gray-50">
                    {notifications.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <BellOff className="mx-auto mb-3 opacity-20" size={48} />
                            <p className="text-xs font-bold uppercase tracking-widest">Aucune nouvelle notification</p>
                        </div>
                    ) : (
                        notifications.map((notif) => (
                            <div key={notif.id} className={`p-6 hover:bg-gray-50 transition-colors group ${!notif.isRead ? 'bg-blue-50/30' : ''}`}>
                                <div className="flex gap-4">
                                    <div className={`mt-1 p-2 rounded-xl flex-shrink-0 ${notif.type === 'warning' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-black text-gray-900 uppercase tracking-tight text-sm">{notif.title}</h4>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{notif.time}</span>
                                        </div>
                                        <p className="text-xs font-medium text-gray-500 mt-1 leading-relaxed">{notif.message}</p>

                                        {notif.actionLink && onNavigate && (
                                            <button
                                                onClick={() => onNavigate(notif.actionLink!, { patientId: notif.patientId })}
                                                className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 hover:underline"
                                            >
                                                Voir le dossier <ArrowRight size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationCenter;

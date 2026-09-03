import React from 'react';
import { Activity, FileText, Wallet, FlaskConical, ShieldCheck, FileText as FileTextIcon, Syringe, History } from 'lucide-react';
import { TimelineEvent, TimelineEventType } from '../../services/timelineService';

const ICONS: Record<TimelineEventType, React.ReactNode> = {
    consultation: <Activity size={14} />,
    prescription: <FileText size={14} />,
    invoice: <Wallet size={14} />,
    lab_request: <FlaskConical size={14} />,
    result: <ShieldCheck size={14} />,
    certificate: <FileTextIcon size={14} />,
    vaccination: <Syringe size={14} />,
};

const COLORS: Record<TimelineEventType, string> = {
    consultation: 'bg-emerald-100 text-emerald-600',
    prescription: 'bg-blue-100 text-blue-600',
    invoice: 'bg-amber-100 text-amber-600',
    lab_request: 'bg-purple-100 text-purple-600',
    result: 'bg-sky-100 text-sky-600',
    certificate: 'bg-indigo-100 text-indigo-600',
    vaccination: 'bg-rose-100 text-rose-600',
};

interface PatientTimelineProps {
    events: TimelineEvent[];
    onSelect: (event: TimelineEvent) => void;
}

const PatientTimeline: React.FC<PatientTimelineProps> = ({ events, onSelect }) => {
    if (events.length === 0) {
        return (
            <div className="p-12 text-center opacity-40">
                <History size={32} className="mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Aucun événement enregistré</p>
            </div>
        );
    }

    return (
        <div className="relative pl-6">
            <div className="absolute left-[9px] top-1 bottom-1 w-px bg-gray-100" />
            <div className="space-y-3">
                {events.map(ev => (
                    <button
                        key={ev.id}
                        onClick={() => onSelect(ev)}
                        className="relative w-full text-left flex items-start gap-3 p-3 rounded-xl bg-white border border-gray-100 hover:border-[#1D9E75] hover:shadow-sm transition-all group"
                    >
                        <div className={`absolute -left-6 top-3 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${COLORS[ev.type]}`}>
                            {ICONS[ev.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-gray-800 truncate group-hover:text-[#1D9E75]">{ev.title}</p>
                                <span className="text-[10px] text-gray-400 font-semibold shrink-0">{ev.date}</span>
                            </div>
                            {ev.subtitle && <p className="text-[11px] text-gray-400 truncate mt-0.5">{ev.subtitle}</p>}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default PatientTimeline;

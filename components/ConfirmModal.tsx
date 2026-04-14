
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: 'danger' | 'warning' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    type = 'danger'
}) => {
    if (!isOpen) return null;

    const colors = {
        danger: 'text-red-600 bg-red-50 border-red-100 ring-red-50/50',
        warning: 'text-amber-600 bg-amber-50 border-amber-100 ring-amber-50/50',
        info: 'text-emerald-700 bg-emerald-50 border-emerald-100 ring-emerald-50/50'
    };

    const btnColors = {
        danger: 'bg-red-600 hover:bg-red-700 shadow-red-200',
        warning: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200',
        info: 'bg-emerald-700 hover:bg-emerald-800 shadow-emerald-200'
    };

    return (
        <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Background Decorative Pattern */}
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none text-slate-900">
                    <AlertTriangle size={120} />
                </div>

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ring-8 ${colors[type]}`}>
                            <AlertTriangle size={28} />
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-2 mb-8">
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-tight">
                            {title}
                        </h3>
                        <p className="text-slate-500 font-bold text-sm leading-relaxed">
                            {message}
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-6 py-4 bg-slate-50 hover:bg-slate-100 text-slate-400 font-black rounded-2xl uppercase text-[10px] tracking-widest transition-all active:scale-95 border border-slate-100"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`flex-1 px-6 py-4 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-lg ${btnColors[type]}`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;

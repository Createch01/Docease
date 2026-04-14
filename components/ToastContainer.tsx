
import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { toastService, Toast } from '../services/toastService';

const ToastContainer: React.FC = () => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        return toastService.subscribe(setToasts);
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="text-emerald-500" size={20} />;
            case 'error': return <AlertCircle className="text-red-500" size={20} />;
            case 'warning': return <AlertTriangle className="text-amber-500" size={20} />;
            default: return <Info className="text-blue-500" size={20} />;
        }
    };

    const getStyles = (type: string) => {
        switch (type) {
            case 'success': return 'border-emerald-100 bg-emerald-50/90 text-emerald-900';
            case 'error': return 'border-red-100 bg-red-50/90 text-red-900';
            case 'warning': return 'border-amber-100 bg-amber-50/90 text-amber-900';
            default: return 'border-blue-100 bg-blue-50/90 text-blue-900';
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-md w-full sm:w-[400px]">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`flex items-start gap-3 p-4 rounded-2xl border shadow-lg backdrop-blur-md animate-in slide-in-from-right-4 duration-300 ${getStyles(toast.type)}`}
                >
                    <div className="shrink-0 mt-0.5">
                        {getIcon(toast.type)}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold leading-tight uppercase tracking-tight">{toast.message}</p>
                    </div>
                    <button
                        onClick={() => toastService.remove(toast.id)}
                        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ToastContainer;

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-md w-full sm:w-[400px]">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`
              flex items-center gap-4 p-4 rounded-[1.5rem] border shadow-xl animate-in fade-in slide-in-from-right-4 duration-300
              ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : ''}
              ${toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : ''}
              ${toast.type === 'info' ? 'bg-blue-50 border-blue-100 text-blue-800' : ''}
              ${toast.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' : ''}
            `}
                    >
                        <div className={`
              w-10 h-10 rounded-xl flex items-center justify-center shrink-0
              ${toast.type === 'success' ? 'bg-emerald-200 text-emerald-700' : ''}
              ${toast.type === 'error' ? 'bg-red-200 text-red-700' : ''}
              ${toast.type === 'info' ? 'bg-blue-200 text-blue-700' : ''}
              ${toast.type === 'warning' ? 'bg-amber-200 text-amber-700' : ''}
            `}>
                            {toast.type === 'success' && <CheckCircle2 size={20} />}
                            {toast.type === 'error' && <AlertCircle size={20} />}
                            {toast.type === 'info' && <Info size={20} />}
                            {toast.type === 'warning' && <AlertTriangle size={20} />}
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-black uppercase tracking-widest opacity-40 mb-0.5">{toast.type}</p>
                            <p className="text-sm font-bold leading-tight">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="p-1.5 hover:bg-black/5 rounded-lg transition-colors text-current opacity-30 hover:opacity-100"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
};

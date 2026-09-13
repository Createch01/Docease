
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

type ToastListener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners: Set<ToastListener> = new Set();

const notify = () => {
    listeners.forEach(listener => listener([...toasts]));
};

export const toastService = {
    subscribe: (listener: ToastListener) => {
        listeners.add(listener);
        listener([...toasts]);
        return () => { listeners.delete(listener); };
    },

    show: (message: string, type: ToastType = 'info', duration = 4000) => {
        const id = Math.random().toString(36).substr(2, 9);
        const toast: Toast = { id, message, type, duration };
        toasts.push(toast);
        notify();

        if (duration > 0) {
            setTimeout(() => {
                toastService.remove(id);
            }, duration);
        }
    },

    success: (message: string) => toastService.show(message, 'success'),
    error: (message: string) => toastService.show(message, 'error'),
    info: (message: string) => toastService.show(message, 'info'),
    warning: (message: string) => toastService.show(message, 'warning'),

    remove: (id: string) => {
        toasts = toasts.filter(t => t.id !== id);
        notify();
    }
};

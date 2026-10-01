import React from 'react';
import { getDevAutoUnlockPassword } from '../services/devAutoUnlock';

// DEV only: makes the auto-unlock mode visible. Renders nothing in production.
const DevAutoUnlockBadge: React.FC = () => {
    if (!getDevAutoUnlockPassword()) return null;
    return (
        <div
            className="fixed bottom-2 left-2 z-[200] pointer-events-none select-none rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 opacity-80"
            aria-hidden="true"
        >
            DEV · déverrouillage auto
        </div>
    );
};

export default DevAutoUnlockBadge;

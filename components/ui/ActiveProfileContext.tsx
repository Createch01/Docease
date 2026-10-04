import React, { createContext, useContext, useState, useCallback } from 'react';
import { ActivePatientProfile, EMPTY_PROFILE } from '../../services/activeProfileService';

interface ActiveProfileContextType {
    profile: ActivePatientProfile;
    setProfile: (profile: ActivePatientProfile) => void;
    resetProfile: () => void;
}

const ActiveProfileContext = createContext<ActiveProfileContextType | undefined>(undefined);

export const ActiveProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [profile, setProfileState] = useState<ActivePatientProfile>(EMPTY_PROFILE);

    const setProfile = useCallback((next: ActivePatientProfile) => {
        setProfileState(next);
    }, []);

    const resetProfile = useCallback(() => {
        setProfileState(EMPTY_PROFILE);
    }, []);

    return (
        <ActiveProfileContext.Provider value={{ profile, setProfile, resetProfile }}>
            {children}
        </ActiveProfileContext.Provider>
    );
};

export function useActiveProfile(): ActiveProfileContextType {
    const ctx = useContext(ActiveProfileContext);
    if (!ctx) throw new Error('useActiveProfile must be used within an ActiveProfileProvider');
    return ctx;
}

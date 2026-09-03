import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
    ActivePatientProfile, EMPTY_PROFILE,
    loadActiveProfile, saveActiveProfile, clearActiveProfile,
} from '../../services/activeProfileService';

interface ActiveProfileContextType {
    profile: ActivePatientProfile;
    setProfile: (profile: ActivePatientProfile) => void;
    resetProfile: () => void;
}

const ActiveProfileContext = createContext<ActiveProfileContextType | undefined>(undefined);

export const ActiveProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [profile, setProfileState] = useState<ActivePatientProfile>(EMPTY_PROFILE);

    useEffect(() => { setProfileState(loadActiveProfile()); }, []);

    const setProfile = useCallback((next: ActivePatientProfile) => {
        setProfileState(next);
        saveActiveProfile(next);
    }, []);

    const resetProfile = useCallback(() => {
        setProfileState(EMPTY_PROFILE);
        clearActiveProfile();
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

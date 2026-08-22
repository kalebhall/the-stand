'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type ConductingModeContextType = {
  isConductingMode: boolean;
  setConductingMode: (active: boolean) => void;
  toggleConductingMode: () => void;
};

const ConductingModeContext = createContext<ConductingModeContextType | null>(null);

const STORAGE_KEY = 'the-stand:conducting-mode';

export function ConductingModeProvider({ children }: { children: ReactNode }) {
  const [isConductingMode, setIsConductingModeState] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') {
        setIsConductingModeState(true);
      }
    } catch {
      // Ignore localStorage read errors in restricted contexts
    }
  }, []);

  const setConductingMode = (active: boolean) => {
    setIsConductingModeState(active);
    try {
      localStorage.setItem(STORAGE_KEY, active ? 'true' : 'false');
    } catch {
      // Ignore localStorage write errors
    }
  };

  const toggleConductingMode = () => {
    setConductingMode(!isConductingMode);
  };

  return (
    <ConductingModeContext.Provider
      value={{
        isConductingMode,
        setConductingMode,
        toggleConductingMode
      }}
    >
      {children}
    </ConductingModeContext.Provider>
  );
}

export function useConductingMode() {
  const context = useContext(ConductingModeContext);
  if (!context) {
    throw new Error('useConductingMode must be used within a ConductingModeProvider');
  }
  return context;
}

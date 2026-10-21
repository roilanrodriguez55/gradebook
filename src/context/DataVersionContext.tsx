import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface DataVersionValue {
  version: number;
  refresh: () => void;
}

const DataVersionContext = createContext<DataVersionValue>({ version: 0, refresh: () => {} });

// Cada mutacion llama a refresh(); las pantallas y el arbol usan `version` como dependencia para recargar.
export function DataVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, refresh }), [version, refresh]);
  return <DataVersionContext.Provider value={value}>{children}</DataVersionContext.Provider>;
}

export function useDataVersion(): DataVersionValue {
  return useContext(DataVersionContext);
}

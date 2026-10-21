import { useCallback, useEffect, useState, type DependencyList } from "react";
import { useToast } from "../components/ui/useToast";
import { errorMessage } from "./errorMessage";

export interface LoadState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

// Carga datos asincronos. Ignora respuestas viejas si cambian las dependencias o se pide recargar.
// Expone el error para que la pantalla lo muestre con opcion de reintentar.
export function useLoadState<T>(load: () => Promise<T>, deps: DependencyList): LoadState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .then((value) => {
        if (!active) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, error, loading, reload };
}

// Como useLoadState, pero solo devuelve los datos. Los errores se muestran en toast.
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): T | undefined {
  const toast = useToast();
  const { data, error } = useLoadState(load, deps);

  useEffect(() => {
    if (error !== null) toast.show(error);
  }, [error]);

  return data;
}

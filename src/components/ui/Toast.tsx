import { X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { ToastContext, type ToastAction, type ToastApi, type ToastOptions, type ToastVariant } from "./useToast";

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
  variant: ToastVariant;
}

const TEXT_BY_VARIANT: Record<ToastVariant, string> = {
  error: "text-danger",
  success: "text-accent",
  info: "text-ink",
};

const AUTO_HIDE_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, action?: ToastAction, options?: ToastOptions) => {
      const id = nextId.current++;
      const variant = options?.variant ?? "error";
      setItems((list) => [...list, { id, message, action, variant }]);
      window.setTimeout(() => dismiss(id), AUTO_HIDE_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex items-start gap-2 rounded-md border border-line bg-surface p-3 shadow-sm"
          >
            <p className={`flex-1 ${TEXT_BY_VARIANT[t.variant]}`}>{t.message}</p>
            {t.action ? (
              <Button variant="ghost" size="xs" onClick={t.action.onClick}>
                {t.action.label}
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

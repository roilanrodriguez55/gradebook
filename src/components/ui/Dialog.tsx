import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "xl";
}

const WIDTH_BY_SIZE = { md: "max-w-lg", xl: "max-w-4xl" } as const;

export function Dialog({ open, title, onClose, children, size = "md" }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`flex max-h-[80vh] w-full ${WIDTH_BY_SIZE[size]} flex-col rounded-lg border border-line bg-surface shadow-sm`}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 id="dialog-title" className="font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </Button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

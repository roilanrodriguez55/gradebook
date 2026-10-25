import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

interface MenuProps {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}

interface Coords {
  top: number;
  left: number;
}

const GAP = 4;
const MARGIN = 8;

export function Menu({ label, trigger, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  // Se mide tras montar el panel (oculto) para decidir si se voltea hacia arriba.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const flip = height + GAP > spaceBelow && spaceAbove >= height + GAP;

    const top = flip ? rect.top - GAP - height : rect.bottom + GAP;
    const left = Math.max(MARGIN, Math.min(rect.right - width, window.innerWidth - width - MARGIN));
    setCoords({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => (open ? close() : setOpen(true))}
        >
          {trigger}
        </Button>
      </span>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            className="fixed z-[60] flex w-52 flex-col gap-0.5 rounded-md border border-line bg-surface p-1 shadow-sm"
            style={{
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

interface MenuItemProps {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function MenuItem({ disabled = false, onClick, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 items-center rounded px-2 text-left text-sm hover:bg-hover disabled:opacity-50"
    >
      {children}
    </button>
  );
}

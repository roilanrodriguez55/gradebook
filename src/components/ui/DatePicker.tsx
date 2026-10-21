import clsx from "clsx";
import { CalendarDays } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker, type ClassNames, type DayButtonProps } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { formatDueDateLong, parseIsoDate, toIsoDate } from "../../lib/dueDate";
import { Button } from "./Button";
import { fieldBase } from "./fieldStyles";

const GAP = 4;
const MARGIN = 8;

const NAV_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30 [&_svg]:size-4 [&_svg]:fill-current";

const CLASS_NAMES: Partial<ClassNames> = {
  root: "relative",
  months: "flex",
  month: "flex flex-col gap-2",
  month_caption: "flex h-8 items-center justify-center",
  caption_label: "text-sm font-semibold",
  nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between",
  button_previous: NAV_BUTTON,
  button_next: NAV_BUTTON,
  month_grid: "border-collapse",
  weekdays: "",
  weekday: "size-9 p-0 text-center text-xs font-medium text-muted",
  week: "",
  day: "p-0 text-center",
};

function DayCellButton(props: DayButtonProps) {
  const { modifiers, className, ...rest } = props;
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex size-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40",
        modifiers.selected ? "bg-accent font-semibold text-accent-fg hover:opacity-90" : "text-ink hover:bg-hover",
        modifiers.today && !modifiers.selected && "font-semibold ring-1 ring-inset ring-accent",
        modifiers.outside && !modifiers.selected && "text-muted/60",
        className,
      )}
    />
  );
}

const DAY_COMPONENTS = { DayButton: DayCellButton };

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Sin fecha",
  disabled,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseIsoDate(value) ?? new Date());
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedDate = parseIsoDate(value);

  function openPopover() {
    setMonth(selectedDate ?? new Date());
    setOpen(true);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  // Esc cierra solo el popover. Va en captura para cortar antes del listener de Dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Clic fuera del boton y del popover lo cierra.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // El popover va en body con posicion fija: se coloca debajo del boton, o encima si no cabe.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current;
      const popover = popoverRef.current;
      if (!button || !popover) return;
      const rect = button.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = popover;
      const fitsBelow = rect.bottom + GAP + height <= window.innerHeight - MARGIN;
      const top = fitsBelow ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - height);
      const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - width - MARGIN);
      setPosition((prev) => (prev.top === top && prev.left === left ? prev : { top, left }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const footer = (
    <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
      <Button variant="ghost" className="h-7 text-accent" onClick={() => choose(toIsoDate(new Date()))}>
        Hoy
      </Button>
      <Button variant="ghost" className="h-7 text-accent" onClick={() => choose("")}>
        Limpiar
      </Button>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPopover())}
        className={clsx(fieldBase, "flex h-8 items-center gap-2 text-left hover:bg-hover")}
      >
        <CalendarDays size={15} className="shrink-0 text-muted" aria-hidden="true" />
        <span className={clsx("truncate", !selectedDate && "text-muted")}>
          {selectedDate ? formatDueDateLong(value) : placeholder}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Elegir fecha"
            style={{ top: position.top, left: position.left }}
            className="fixed z-[60] w-max rounded-xl border border-line bg-surface p-3 text-ink shadow-[0_8px_24px_-6px_rgb(0_0_0/0.25)]"
          >
            <DayPicker
              mode="single"
              locale={es}
              selected={selectedDate}
              onSelect={(date) => choose(date ? toIsoDate(date) : "")}
              month={month}
              onMonthChange={setMonth}
              showOutsideDays
              fixedWeeks
              autoFocus
              footer={footer}
              classNames={CLASS_NAMES}
              components={DAY_COMPONENTS}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

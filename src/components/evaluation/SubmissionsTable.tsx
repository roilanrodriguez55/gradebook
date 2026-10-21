import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import clsx from "clsx";
import {
  AlarmClock,
  AlertTriangle,
  Ban,
  Check,
  Circle,
  CircleCheck,
  Clock,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect, type KeyboardEvent, type ReactNode } from "react";
import * as submissions from "../../db/submissions";
import type { DownloadStatus, Student, Submission, SubmissionStatus } from "../../db/types";
import { validateGrade } from "../../lib/grade";
import { errorMessage } from "../../lib/errorMessage";
import { normalizeGithubUrl } from "../../lib/repoUrl";
import { isDelivered } from "../../lib/submissionStatus";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/useToast";

export interface SubmissionRow {
  submission: Submission;
  student: Student;
}

// Guarda un cambio: aplica `patch` de inmediato y ejecuta `write`. Si falla, revierte y avisa.
export type SaveSubmission = (id: number, patch: Partial<Submission>, write: () => Promise<void>) => Promise<void>;

interface TableRow extends SubmissionRow {
  number: number;
}

const columnHelper = createColumnHelper<TableRow>();
const collator = new Intl.Collator("es", { sensitivity: "base" });

// Quita acentos y pasa a minusculas para que la busqueda no dependa de tildes.
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

const STATUS_META: Record<SubmissionStatus, { label: string; tone: BadgeTone; Icon: LucideIcon }> = {
  pendiente: { label: "Pendiente", tone: "neutral", Icon: Clock },
  entregado: { label: "Entregado", tone: "accent", Icon: CircleCheck },
  tardia: { label: "Tardia", tone: "danger", Icon: AlarmClock },
  no_entrego: { label: "No entrego", tone: "neutral", Icon: Ban },
};

const STATUS_ORDER: SubmissionStatus[] = ["pendiente", "entregado", "tardia", "no_entrego"];

const DOWNLOAD_META: Record<DownloadStatus, { label: string; tone: BadgeTone; Icon: LucideIcon; spin: boolean }> = {
  sin_descargar: { label: "Sin descargar", tone: "neutral", Icon: Circle, spin: false },
  descargando: { label: "Descargando", tone: "accent", Icon: Loader2, spin: true },
  ok: { label: "Descargado", tone: "accent", Icon: Check, spin: false },
  error: { label: "Error", tone: "danger", Icon: AlertTriangle, spin: false },
};

type FilterKey = "todos" | "pendientes" | "entregados" | "tardias" | "no_entrego" | "sin_calificar";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "entregados", label: "Entregados" },
  { key: "tardias", label: "Tardias" },
  { key: "no_entrego", label: "No entregaron" },
  { key: "sin_calificar", label: "Sin calificar" },
];

function matchesFilter(submission: Submission, filter: FilterKey): boolean {
  switch (filter) {
    case "todos":
      return true;
    case "pendientes":
      return submission.status === "pendiente";
    case "entregados":
      return submission.status === "entregado";
    case "tardias":
      return submission.status === "tardia";
    case "no_entrego":
      return submission.status === "no_entrego";
    case "sin_calificar":
      return isDelivered(submission) && submission.grade === null;
  }
}

// Celda de repositorio: normaliza al perder foco o con Enter. Guardar solo si la URL es valida.
function RepoCell({ submission, onSave }: { submission: Submission; onSave: SaveSubmission }) {
  const current = submission.repo_url ?? "";
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(current);

  useEffect(() => {
    setDraft(current);
    setError(null);
    savedRef.current = current;
  }, [current]);

  function commit() {
    const trimmed = draft.trim();
    let normalized: string | null = null;
    if (trimmed !== "") {
      normalized = normalizeGithubUrl(trimmed);
      if (normalized === null) {
        setError("URL de GitHub invalida");
        return;
      }
    }
    setError(null);
    const next = normalized ?? "";
    setDraft(next);
    if (next === savedRef.current) return;
    savedRef.current = next;

    let status: SubmissionStatus | null = null;
    if (normalized !== null && submission.status === "pendiente") status = "entregado";
    if (normalized === null && isDelivered(submission)) status = "pendiente";

    void onSave(submission.id, { repo_url: normalized, ...(status ? { status } : {}) }, async () => {
      await submissions.setRepoUrl(submission.id, normalized);
      if (status) await submissions.setStatus(submission.id, status);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit();
  }

  return (
    <div className="flex flex-col">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder="https://github.com/usuario/repo"
        aria-label="Repositorio"
        aria-invalid={error !== null}
        className={clsx("w-full min-w-48", error !== null && "border-danger")}
      />
      {error !== null && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function StatusCell({ submission, onSave }: { submission: Submission; onSave: SaveSubmission }) {
  const meta = STATUS_META[submission.status];
  const { Icon } = meta;

  function change(next: SubmissionStatus) {
    if (next === submission.status) return;
    void onSave(submission.id, { status: next }, () => submissions.setStatus(submission.id, next));
  }

  return (
    <div className="flex items-center gap-2">
      <Badge tone={meta.tone}>
        <span className="inline-flex items-center gap-1">
          <Icon size={12} aria-hidden="true" />
          {meta.label}
        </span>
      </Badge>
      <Select
        aria-label="Cambiar estado"
        value={submission.status}
        onChange={(e) => change(e.target.value as SubmissionStatus)}
        className="w-32"
      >
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {STATUS_META[status].label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function DownloadCell({ submission }: { submission: Submission }) {
  const meta = DOWNLOAD_META[submission.download_status];
  const { Icon } = meta;
  const title = submission.download_status === "error" ? (submission.download_error ?? "Error de descarga") : undefined;

  return (
    <span title={title}>
      <Badge tone={meta.tone}>
        <span className="inline-flex items-center gap-1">
          <Icon size={12} aria-hidden="true" className={clsx(meta.spin && "animate-spin")} />
          {meta.label}
        </span>
      </Badge>
    </span>
  );
}

// Celda de nota: valida contra la escala de la asignatura. Enter guarda y pasa a la nota de la fila siguiente.
function GradeCell({
  submission,
  gradeMin,
  gradeMax,
  index,
  onSave,
}: {
  submission: Submission;
  gradeMin: number;
  gradeMax: number;
  index: number;
  onSave: SaveSubmission;
}) {
  const current = submission.grade === null ? "" : String(submission.grade);
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(current);

  useEffect(() => {
    setDraft(current);
    setError(null);
    savedRef.current = current;
  }, [current]);

  // Devuelve false si la nota no es valida.
  function commit(): boolean {
    const trimmed = draft.trim().replace(",", ".");
    let grade: number | null = null;
    if (trimmed !== "") {
      const check = validateGrade(Number(trimmed), gradeMin, gradeMax);
      if (!check.ok) {
        setError(`Entre ${gradeMin} y ${gradeMax}`);
        return false;
      }
      grade = check.value;
    }
    setError(null);
    const next = grade === null ? "" : String(grade);
    setDraft(next);
    if (next === savedRef.current) return true;
    savedRef.current = next;
    void onSave(submission.id, { grade }, () => submissions.setGrade(submission.id, grade));
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!commit()) return;
    const next = e.currentTarget
      .closest("tbody")
      ?.querySelector<HTMLInputElement>(`input[data-grade-row="${index + 1}"]`);
    next?.focus();
    next?.select();
  }

  return (
    <div className="flex flex-col items-end">
      <Input
        type="number"
        min={gradeMin}
        max={gradeMax}
        step="any"
        inputMode="decimal"
        placeholder={`${gradeMin}-${gradeMax}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          commit();
        }}
        onKeyDown={onKeyDown}
        data-grade-row={index}
        aria-label="Nota"
        aria-invalid={error !== null}
        className={clsx("w-24 text-right tabular-nums", error !== null && "border-danger")}
      />
      {error !== null && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function CommentDialog({
  submission,
  studentName,
  onSave,
  onClose,
}: {
  submission: Submission;
  studentName: string;
  onSave: SaveSubmission;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(submission.comment ?? "");

  function save() {
    const next = draft.trim() || null;
    onClose();
    if (next === submission.comment) return;
    void onSave(submission.id, { comment: next }, () => submissions.setComment(submission.id, next));
  }

  return (
    <Dialog open title={`Comentario de ${studentName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={2000}
          autoFocus
          aria-label="Comentario"
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Guardar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CommentCell({
  submission,
  studentName,
  onSave,
}: {
  submission: Submission;
  studentName: string;
  onSave: SaveSubmission;
}) {
  const [open, setOpen] = useState(false);
  const hasComment = (submission.comment ?? "").trim() !== "";

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`Comentario de ${studentName}`}
        title={hasComment ? "Ver o editar comentario" : "Agregar comentario"}
      >
        <MessageSquare size={14} fill={hasComment ? "currentColor" : "none"} className={clsx(hasComment && "text-accent")} />
      </Button>
      {open && (
        <CommentDialog
          submission={submission}
          studentName={studentName}
          onSave={onSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MenuItem({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
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

const DOWNLOAD_LABEL: Record<DownloadStatus, string> = {
  sin_descargar: "Descargar",
  descargando: "Descargar",
  ok: "Actualizar",
  error: "Reintentar",
};

function ActionsCell({
  submission,
  studentName,
  busy,
  onDownload,
}: {
  submission: Submission;
  studentName: string;
  busy: boolean;
  onDownload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const repoUrl = submission.repo_url;
  const localPath = submission.local_path;

  async function run(action: () => Promise<void>) {
    setOpen(false);
    try {
      await action();
    } catch (err) {
      toast.show(errorMessage(err));
    }
  }

  return (
    <div className="relative flex justify-end">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Acciones de ${studentName}`}
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 flex w-52 flex-col gap-0.5 rounded-md border border-line bg-surface p-1 shadow-sm"
        >
          <MenuItem
            disabled={!repoUrl}
            onClick={() => {
              if (repoUrl) void run(() => openUrl(repoUrl));
            }}
          >
            Abrir en GitHub
          </MenuItem>
          <MenuItem
            disabled={!localPath}
            onClick={() => {
              if (localPath) void run(() => openPath(localPath));
            }}
          >
            Abrir carpeta local
          </MenuItem>
          <MenuItem disabled={!repoUrl || busy} onClick={() => void run(onDownload)}>
            {DOWNLOAD_LABEL[submission.download_status]}
          </MenuItem>
        </div>
      )}
    </div>
  );
}

interface SubmissionsTableProps {
  rows: SubmissionRow[];
  gradeMin: number;
  gradeMax: number;
  onSave: SaveSubmission;
  // Hay una descarga en curso: las acciones de descarga por fila quedan deshabilitadas.
  downloading: boolean;
  onDownload: (row: SubmissionRow) => Promise<void>;
}

export function SubmissionsTable({ rows, gradeMin, gradeMax, onSave, downloading, onDownload }: SubmissionsTableProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          collator.compare(a.student.last_names, b.student.last_names) ||
          collator.compare(a.student.first_names, b.student.first_names),
      ),
    [rows],
  );

  const q = normalizeText(query.trim());
  const visible: TableRow[] = sorted
    .map((row, index) => ({ ...row, number: index + 1 }))
    .filter(
      (row) =>
        matchesFilter(row.submission, filter) &&
        (q === "" || normalizeText(`${row.student.first_names} ${row.student.last_names}`).includes(q)),
    );

  const columns = useMemo(
    () => [
      columnHelper.accessor("number", {
        header: "#",
        size: 48,
        cell: (info) => <span className="text-muted tabular-nums">{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: "estudiante",
        header: "Estudiante",
        size: 220,
        cell: (info) => {
          const { student } = info.row.original;
          return (
            <span className="block truncate">
              {student.first_names} {student.last_names}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "repositorio",
        header: "Repositorio",
        size: 280,
        cell: (info) => <RepoCell submission={info.row.original.submission} onSave={onSave} />,
      }),
      columnHelper.display({
        id: "estado",
        header: "Estado",
        size: 240,
        cell: (info) => <StatusCell submission={info.row.original.submission} onSave={onSave} />,
      }),
      columnHelper.display({
        id: "descarga",
        header: "Descarga",
        size: 130,
        cell: (info) => <DownloadCell submission={info.row.original.submission} />,
      }),
      columnHelper.display({
        id: "nota",
        header: "Nota",
        size: 120,
        cell: (info) => (
          <GradeCell
            submission={info.row.original.submission}
            gradeMin={gradeMin}
            gradeMax={gradeMax}
            index={info.row.index}
            onSave={onSave}
          />
        ),
      }),
      columnHelper.display({
        id: "comentario",
        header: "Comentario",
        size: 100,
        cell: (info) => {
          const { submission, student } = info.row.original;
          return (
            <CommentCell
              submission={submission}
              studentName={`${student.first_names} ${student.last_names}`}
              onSave={onSave}
            />
          );
        },
      }),
      columnHelper.display({
        id: "acciones",
        header: () => <span className="sr-only">Acciones</span>,
        size: 64,
        cell: (info) => {
          const { submission, student } = info.row.original;
          return (
            <ActionsCell
              submission={submission}
              studentName={`${student.first_names} ${student.last_names}`}
              busy={downloading}
              onDownload={() => onDownload(info.row.original)}
            />
          );
        },
      }),
    ],
    [gradeMin, gradeMax, onSave, downloading, onDownload],
  );

  const table = useReactTable({
    data: visible,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.submission.id),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar estudiante"
            aria-label="Buscar estudiante"
            className="w-full pl-8"
          />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} aria-label="Filtrar entregas" className="w-44">
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-left">
          <thead className="bg-hover text-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="h-9">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} style={{ width: header.getSize() }} className="px-3 font-medium">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="h-10 border-t border-line hover:bg-hover">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted">
                  Ninguna entrega coincide con la busqueda o el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

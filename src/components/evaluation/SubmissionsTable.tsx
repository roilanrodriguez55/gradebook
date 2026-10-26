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
  Pencil,
  Search,
  UserPen,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import * as submissions from "../../db/submissions";
import type { DownloadStatus, Student, Submission, SubmissionStatus } from "../../db/types";
import { validateGrade } from "../../lib/grade";
import { errorMessage } from "../../lib/errorMessage";
import { normalizeGithubUrl } from "../../lib/repoUrl";
import { FILTERS, matchesFilter, type FilterKey } from "../../lib/submissionFilter";
import { isDelivered } from "../../lib/submissionStatus";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Menu, MenuItem } from "../ui/Menu";
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

// Datos que cambian entre renders. Van por `meta` para que las columnas sean estables:
// si las columnas se recrean, TanStack remonta todas las celdas y se pierde foco, selects y menus abiertos.
interface TableMeta {
  gradeMin: number;
  gradeMax: number;
  carrierIds: Set<number>;
  onSave: SaveSubmission;
  downloading: boolean;
  onDownload: (row: SubmissionRow) => Promise<void>;
  onEditStudent: (student: Student) => void;
}

function metaOf(table: { options: { meta?: unknown } }): TableMeta {
  return table.options.meta as TableMeta;
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

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const meta = STATUS_META[status];
  const { Icon } = meta;

  return (
    <Badge tone={meta.tone}>
      <span className="inline-flex items-center gap-1">
        <Icon size={12} aria-hidden="true" />
        {meta.label}
      </span>
    </Badge>
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

interface EditSubmissionDialogProps {
  submission: Submission;
  studentName: string;
  gradeMin: number;
  gradeMax: number;
  onSave: SaveSubmission;
  onClose: () => void;
}

// Edita los campos de una entrega. Solo se guardan los campos que cambiaron.
function EditSubmissionDialog({ submission, studentName, gradeMin, gradeMax, onSave, onClose }: EditSubmissionDialogProps) {
  const [repoDraft, setRepoDraft] = useState(submission.repo_url ?? "");
  const [statusDraft, setStatusDraft] = useState<SubmissionStatus>(submission.status);
  const [gradeDraft, setGradeDraft] = useState(submission.grade === null ? "" : String(submission.grade));
  const [commentDraft, setCommentDraft] = useState(submission.comment ?? "");
  const [repoError, setRepoError] = useState<string | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  function save() {
    setRepoError(null);
    setGradeError(null);

    const trimmedRepo = repoDraft.trim();
    let repoUrl: string | null = null;
    if (trimmedRepo !== "") {
      repoUrl = normalizeGithubUrl(trimmedRepo);
      if (repoUrl === null) {
        setRepoError("URL de GitHub invalida");
        return;
      }
    }

    const trimmedGrade = gradeDraft.trim().replace(",", ".");
    let grade: number | null = null;
    if (trimmedGrade !== "") {
      const check = validateGrade(Number(trimmedGrade), gradeMin, gradeMax);
      if (!check.ok) {
        setGradeError(`Entre ${gradeMin} y ${gradeMax}`);
        return;
      }
      grade = check.value;
    }

    const comment = commentDraft.trim() || null;
    const repoChanged = repoUrl !== (submission.repo_url ?? null);

    // Regla automatica: solo si el usuario no toco el estado en el formulario.
    let status = statusDraft;
    if (statusDraft === submission.status && repoChanged) {
      if (repoUrl !== null && submission.status === "pendiente") status = "entregado";
      if (repoUrl === null && isDelivered(submission)) status = "pendiente";
    }

    const patch: Partial<Submission> = {};
    if (repoChanged) patch.repo_url = repoUrl;
    if (status !== submission.status) patch.status = status;
    if (grade !== submission.grade) patch.grade = grade;
    if (comment !== (submission.comment ?? null)) patch.comment = comment;

    onClose();
    if (Object.keys(patch).length === 0) return;

    const id = submission.id;
    void onSave(id, patch, async () => {
      if (patch.repo_url !== undefined) await submissions.setRepoUrl(id, repoUrl);
      if (patch.status !== undefined) await submissions.setStatus(id, status);
      if (patch.grade !== undefined) await submissions.setGrade(id, grade);
      if (patch.comment !== undefined) await submissions.setComment(id, comment);
    });
  }

  return (
    <Dialog open title={`Entrega de ${studentName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Field label="Repositorio">
            <Input
              value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              placeholder="https://github.com/usuario/repo"
              aria-invalid={repoError !== null}
              className={clsx(repoError !== null && "border-danger")}
            />
          </Field>
          {/* Linea de error siempre presente para que el dialogo no cambie de altura */}
          <span className="min-h-4 text-xs text-danger">{repoError}</span>
        </div>

        <Field label="Estado">
          <Select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as SubmissionStatus)}>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-1">
          <Field label="Nota">
            <Input
              type="number"
              min={gradeMin}
              max={gradeMax}
              step="any"
              inputMode="decimal"
              placeholder={`${gradeMin}-${gradeMax}`}
              value={gradeDraft}
              onChange={(e) => setGradeDraft(e.target.value)}
              aria-invalid={gradeError !== null}
              className={clsx("text-right tabular-nums", gradeError !== null && "border-danger")}
            />
          </Field>
          <span className="min-h-4 text-xs text-danger">{gradeError}</span>
        </div>

        <Field label="Comentario">
          <Textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            rows={4}
            maxLength={2000}
          />
        </Field>

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

const DOWNLOAD_LABEL: Record<DownloadStatus, string> = {
  sin_descargar: "Descargar",
  descargando: "Descargar",
  ok: "Actualizar",
  error: "Reintentar",
};

// El dialogo de edicion vive aqui (no en SubmissionsTable) para que abrirlo no cambie `meta` ni las columnas.
function ActionsCell({
  submission,
  studentName,
  gradeMin,
  gradeMax,
  onSave,
  busy,
  onDownload,
  onEditStudent,
}: {
  submission: Submission;
  studentName: string;
  gradeMin: number;
  gradeMax: number;
  onSave: SaveSubmission;
  busy: boolean;
  onDownload: () => Promise<void>;
  onEditStudent: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const repoUrl = submission.repo_url;
  const localPath = submission.local_path;

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (err) {
      toast.show(errorMessage(err));
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setEditing(true)}
        aria-label={`Editar entrega de ${studentName}`}
        title="Editar entrega"
      >
        <Pencil size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onEditStudent}
        aria-label={`Editar estudiante ${studentName}`}
        title="Editar estudiante"
      >
        <UserPen size={14} />
      </Button>
      <Menu label={`Acciones de ${studentName}`} trigger={<MoreHorizontal size={14} />}>
        {(close) => (
          <>
            <MenuItem
              disabled={!repoUrl}
              onClick={() => {
                close();
                if (repoUrl) void run(() => openUrl(repoUrl));
              }}
            >
              Abrir en GitHub
            </MenuItem>
            <MenuItem
              disabled={!localPath}
              onClick={() => {
                close();
                if (localPath) void run(() => openPath(localPath));
              }}
            >
              Abrir carpeta local
            </MenuItem>
            <MenuItem
              disabled={!repoUrl || busy}
              onClick={() => {
                close();
                void run(onDownload);
              }}
            >
              {DOWNLOAD_LABEL[submission.download_status]}
            </MenuItem>
          </>
        )}
      </Menu>
      {editing && (
        <EditSubmissionDialog
          submission={submission}
          studentName={studentName}
          gradeMin={gradeMin}
          gradeMax={gradeMax}
          onSave={onSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

interface SubmissionsTableProps {
  rows: SubmissionRow[];
  gradeMin: number;
  gradeMax: number;
  onSave: SaveSubmission;
  // Estudiantes que arrastran la asignatura de esta evaluacion.
  carrierIds: Set<number>;
  // Hay una descarga en curso: las acciones de descarga por fila quedan deshabilitadas.
  downloading: boolean;
  onDownload: (row: SubmissionRow) => Promise<void>;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
  onPasteStudents: () => void;
  onAddStudent: () => void;
  onEditStudent: (student: Student) => void;
}

export function SubmissionsTable({
  rows,
  gradeMin,
  gradeMax,
  carrierIds,
  onSave,
  downloading,
  onDownload,
  filter,
  onFilterChange,
  onPasteStudents,
  onAddStudent,
  onEditStudent,
}: SubmissionsTableProps) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          collator.compare(a.student.last_names, b.student.last_names) ||
          collator.compare(a.student.first_names, b.student.first_names),
      ),
    [rows],
  );

  // `data` de la tabla debe ser estable: un array nuevo en cada render dispara el auto-reset de TanStack
  // y provoca un bucle de renders que congela la pantalla.
  const visible = useMemo<TableRow[]>(() => {
    const q = normalizeText(query.trim());
    return sorted
      .map((row, index) => ({ ...row, number: index + 1 }))
      .filter(
        (row) =>
          matchesFilter(row.submission, filter) &&
          (q === "" || normalizeText(`${row.student.first_names} ${row.student.last_names}`).includes(q)),
      );
  }, [sorted, query, filter]);

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
        cell: (info) => {
          const { student, submission } = info.row.original;
          const comment = (submission.comment ?? "").trim();
          const isCarrier = metaOf(info.table).carrierIds.has(student.id);
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">
                {student.first_names} {student.last_names}
              </span>
              {isCarrier && <Badge tone="danger">Arrastre</Badge>}
              {comment !== "" && (
                <span title={comment} className="shrink-0">
                  <MessageSquare size={12} aria-label="Tiene comentario" className="text-accent" />
                </span>
              )}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "estado",
        header: "Estado",
        size: 160,
        cell: (info) => <StatusBadge status={info.row.original.submission.status} />,
      }),
      columnHelper.display({
        id: "descarga",
        header: "Descarga",
        size: 140,
        cell: (info) => <DownloadCell submission={info.row.original.submission} />,
      }),
      columnHelper.display({
        id: "nota",
        header: "Nota",
        size: 100,
        cell: (info) => {
          const { grade } = info.row.original.submission;
          return <span className="block text-right tabular-nums">{grade === null ? "-" : grade}</span>;
        },
      }),
      columnHelper.display({
        id: "acciones",
        header: () => <span className="sr-only">Acciones</span>,
        size: 104,
        cell: (info) => {
          const { submission, student } = info.row.original;
          const meta = metaOf(info.table);
          return (
            <ActionsCell
              submission={submission}
              studentName={`${student.first_names} ${student.last_names}`}
              gradeMin={meta.gradeMin}
              gradeMax={meta.gradeMax}
              onSave={meta.onSave}
              busy={meta.downloading}
              onDownload={() => meta.onDownload(info.row.original)}
              onEditStudent={() => meta.onEditStudent(student)}
            />
          );
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: visible,
    columns,
    getCoreRowModel: getCoreRowModel(),
    autoResetAll: false,
    getRowId: (row) => String(row.submission.id),
    meta: { gradeMin, gradeMax, carrierIds, onSave, downloading, onDownload, onEditStudent } satisfies TableMeta,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative w-80 shrink-0">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar estudiante"
              aria-label="Buscar estudiante"
              className="pl-8"
            />
          </div>
          <Select value={filter} onChange={(e) => onFilterChange(e.target.value as FilterKey)} aria-label="Filtrar entregas" className="w-auto! shrink-0">
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={onPasteStudents}>Pegar lista</Button>
          <Button variant="primary" onClick={onAddStudent}>
            + Estudiante
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-hover text-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="h-9">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} style={{ width: header.id === "estudiante" ? undefined : header.getSize() }} className="px-3 font-medium">
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

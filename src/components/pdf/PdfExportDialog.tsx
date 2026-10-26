import { pdf } from "@react-pdf/renderer";
import { join } from "@tauri-apps/api/path";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import * as evaluations from "../../db/evaluations";
import * as groupSubjects from "../../db/groupSubjects";
import * as groups from "../../db/groups";
import * as settings from "../../db/settings";
import * as students from "../../db/students";
import * as subjects from "../../db/subjects";
import * as submissions from "../../db/submissions";
import type { Evaluation, Group, Student, Submission, Subject } from "../../db/types";
import { resolveSubjectFolder } from "../../lib/download";
import { errorMessage } from "../../lib/errorMessage";
import { sanitizeFolderName } from "../../lib/folderName";
import { FILTERS, type FilterKey } from "../../lib/submissionFilter";
import { useLoadState } from "../../lib/useLoad";
import { buildReportData, type ReportOptions, type SortBy } from "../../pdf/buildReportData";
import { EvaluationReport } from "../../pdf/EvaluationReport";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { LoadError } from "../ui/LoadError";
import { Select } from "../ui/Select";
import { useToast } from "../ui/useToast";

const PREVIEW_DEBOUNCE_MS = 300;

interface Props {
  evaluationId: number;
  open: boolean;
  // Filtro activo en la tabla de entregas. Es el valor inicial del filtro del PDF.
  initialFilter: FilterKey;
  onClose: () => void;
}

interface ReportSource {
  evaluation: Evaluation;
  subject: Subject;
  subjectName: string;
  gradeMax: number;
  group: Group;
  teacherName: string | null;
  students: Student[];
  submissions: Submission[];
  carrierIds: Set<number>;
}

// Nombre del PDF. Con un filtro distinto de "todos" se agrega su clave (ej. Notas_Tema_entregados.pdf).
function pdfFileName(folderName: string, filter: FilterKey): string {
  return filter === "todos" ? `Notas_${folderName}.pdf` : `Notas_${folderName}_${filter}.pdf`;
}

// Genera el PDF con las opciones que se pasan. Se usa para la vista previa y para guardar.
function renderPdf(source: ReportSource, options: ReportOptions): Promise<Blob> {
  const data = buildReportData(
    {
      evaluation: source.evaluation,
      subjectName: source.subjectName,
      gradeMax: source.gradeMax,
      groupName: source.group.name,
      groupPeriod: source.group.period,
      teacherName: source.teacherName,
      students: source.students,
      submissions: source.submissions,
      carrierIds: source.carrierIds,
    },
    options,
  );
  const generatedAt = new Date().toLocaleDateString("es");
  return pdf(<EvaluationReport data={data} options={options} generatedAt={generatedAt} />).toBlob();
}

async function loadSource(evaluationId: number): Promise<ReportSource> {
  const evaluation = await evaluations.get(evaluationId);
  if (!evaluation) throw new Error(`Evaluacion ${evaluationId} no encontrada`);
  const link = await groupSubjects.get(evaluation.group_subject_id);
  if (!link) throw new Error(`Relacion ${evaluation.group_subject_id} no encontrada`);
  const [group, subject, evaluationStudents, entregas, carrierIds, teacherName] = await Promise.all([
    groups.get(link.group_id),
    subjects.get(link.subject_id),
    students.listByEvaluation(evaluationId),
    submissions.listByEvaluation(evaluationId),
    students.carrierIdsByEvaluation(evaluationId),
    settings.get("teacher_name"),
  ]);
  if (!group) throw new Error(`Grupo ${link.group_id} no encontrado`);
  if (!subject) throw new Error(`Asignatura ${link.subject_id} no encontrada`);
  return {
    evaluation,
    subject,
    subjectName: subject.name,
    gradeMax: subject.grade_max,
    group,
    teacherName: teacherName?.trim() || null,
    students: evaluationStudents,
    submissions: entregas,
    carrierIds,
  };
}

export default function PdfExportDialog({ evaluationId, open: isOpen, initialFilter, onClose }: Props) {
  const toast = useToast();
  const sourceState = useLoadState(
    () => (isOpen ? loadSource(evaluationId) : Promise.resolve(null)),
    [evaluationId, isOpen],
  );
  const source = sourceState.data;

  const [includeComments, setIncludeComments] = useState(true);
  const [includeNotDelivered, setIncludeNotDelivered] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("alfabetico");
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  // Carpeta de la asignatura elegida en este dialogo. Se ignora si es de otra asignatura.
  const [chosen, setChosen] = useState<{ subjectId: number; path: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const topic = source?.evaluation.topic ?? "";
  const folderName = sanitizeFolderName(topic);
  const folder =
    source && chosen?.subjectId === source.subject.id ? chosen.path : (source?.subject.download_folder ?? null);
  const [destination, setDestination] = useState<string | null>(null);

  // Cada vez que se abre el dialogo, el filtro del PDF vuelve al de la tabla.
  useEffect(() => {
    if (isOpen) setFilter(initialFilter);
  }, [isOpen, initialFilter]);

  useEffect(() => {
    let cancelled = false;
    if (!folder || folderName === "") {
      setDestination(null);
      return;
    }
    join(folder, folderName)
      .then((dir) => join(dir, pdfFileName(folderName, filter)))
      .then((file) => {
        if (!cancelled) setDestination(file);
      })
      .catch(() => {
        if (!cancelled) setDestination(null);
      });
    return () => {
      cancelled = true;
    };
  }, [folder, folderName, filter]);

  useEffect(() => {
    if (!isOpen || !source) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderPdf(source, { includeComments, includeNotDelivered, sortBy, filter })
        .then((blob) => {
          if (!cancelled) setPreview({ url: URL.createObjectURL(blob), blob });
        })
        .catch((err: unknown) => {
          if (!cancelled) toast.show(errorMessage(err));
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, source, includeComments, includeNotDelivered, sortBy, filter, toast]);

  // Libera la URL de la vista previa anterior cuando se reemplaza o al cerrar.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function savePdf() {
    if (!source) return;
    if (folderName === "") {
      toast.show("El tema de la evaluacion no sirve como nombre de carpeta");
      return;
    }
    setSaving(true);
    try {
      // Si la asignatura no tiene carpeta, la pide y la guarda en la asignatura.
      const base = await resolveSubjectFolder({ id: source.subject.id, download_folder: folder });
      if (base === null) return;
      setChosen({ subjectId: source.subject.id, path: base });
      const dir = await join(base, folderName);
      // Genera el PDF con las opciones actuales: la vista previa puede estar desactualizada.
      const blob = await renderPdf(source, { includeComments, includeNotDelivered, sortBy, filter });
      await mkdir(dir, { recursive: true });
      const file = await join(dir, pdfFileName(folderName, filter));
      await writeFile(file, new Uint8Array(await blob.arrayBuffer()));
      toast.show(`PDF guardado en ${file}`, {
        label: "Abrir carpeta",
        onClick: () => {
          openPath(dir).catch((err: unknown) => toast.show(errorMessage(err)));
        },
      }, { variant: "success" });
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} title="Exportar notas en PDF" onClose={onClose} size="xl">
      {sourceState.error !== null ? (
        <LoadError message={sourceState.error} onRetry={sourceState.reload} />
      ) : !source ? (
        <p className="text-sm text-muted">Cargando datos...</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-accent"
                checked={includeComments}
                onChange={(e) => setIncludeComments(e.target.checked)}
              />
              Incluir comentarios
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-accent"
                checked={includeNotDelivered}
                onChange={(e) => setIncludeNotDelivered(e.target.checked)}
              />
              Incluir no entregados
            </label>
            <Field label="Orden">
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                <option value="alfabetico">Alfabetico</option>
                <option value="nota">Por nota (mayor a menor)</option>
              </Select>
            </Field>
            <Field label="Filtro">
              <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {preview ? (
            <iframe
              title="Vista previa del PDF"
              src={preview.url}
              className="h-[55vh] w-full rounded-md border border-line"
            />
          ) : (
            <p className="flex h-[55vh] items-center justify-center text-sm text-muted">
              Generando vista previa...
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-muted" title={destination ?? undefined}>
              {folder === null
                ? "Sin carpeta de descargas (se pedira al guardar)"
                : `Destino: ${destination ?? folder}`}
            </span>
            <Button
              variant="primary"
              disabled={!source || saving}
              onClick={() => void savePdf()}
            >
              Guardar PDF
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

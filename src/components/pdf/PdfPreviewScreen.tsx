import { join } from "@tauri-apps/api/path";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as evaluations from "../../db/evaluations";
import * as groupSubjects from "../../db/groupSubjects";
import * as groups from "../../db/groups";
import * as settings from "../../db/settings";
import * as students from "../../db/students";
import * as subjects from "../../db/subjects";
import * as submissions from "../../db/submissions";
import type { Evaluation, Group, GroupSubject, Student, Submission, Subject } from "../../db/types";
import { resolveSubjectFolder } from "../../lib/download";
import { errorMessage } from "../../lib/errorMessage";
import { sanitizeFolderName } from "../../lib/folderName";
import { FILTERS, type FilterKey } from "../../lib/submissionFilter";
import { useLoadState } from "../../lib/useLoad";
import {
  buildReportData,
  ESTADO_FILTERS,
  type ReportInput,
  type ReportOptions,
  type SortBy,
} from "../../pdf/buildReportData";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { LoadError } from "../ui/LoadError";
import { Select } from "../ui/Select";
import { useToast } from "../ui/useToast";
import ReportPreview from "./ReportPreview";

interface Props {
  evaluationId: number;
  open: boolean;
  // Filtro activo en la tabla de entregas. El PDF siempre aplica este filtro.
  filter: FilterKey;
  onClose: () => void;
}

interface ReportSource {
  evaluation: Evaluation;
  subject: Subject;
  link: GroupSubject;
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

function reportInput(source: ReportSource): ReportInput {
  return {
    evaluation: source.evaluation,
    subjectName: source.subjectName,
    gradeMax: source.gradeMax,
    groupName: source.group.name,
    groupPeriod: source.group.period,
    teacherName: source.teacherName,
    students: source.students,
    submissions: source.submissions,
    carrierIds: source.carrierIds,
  };
}

// Genera el PDF. Solo se usa al guardar; la vista previa muestra los datos sin generar PDF.
// El import dinamico evita cargar el renderer de PDF al abrir la vista previa.
async function renderPdf(source: ReportSource, options: ReportOptions): Promise<Blob> {
  const [{ pdf }, { EvaluationReport }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../../pdf/EvaluationReport"),
  ]);
  const data = buildReportData(reportInput(source), options);
  const generatedAt = new Date().toLocaleDateString("es");
  return pdf(<EvaluationReport data={data} options={options} generatedAt={generatedAt} />).toBlob();
}

async function loadSource(evaluationId: number): Promise<ReportSource> {
  const evaluation = await evaluations.get(evaluationId);
  if (!evaluation) throw new Error(`Evaluación ${evaluationId} no encontrada`);
  const link = await groupSubjects.get(evaluation.group_subject_id);
  if (!link) throw new Error(`Relación ${evaluation.group_subject_id} no encontrada`);
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
    link,
    subjectName: subject.name,
    gradeMax: subject.grade_max,
    group,
    teacherName: teacherName?.trim() || null,
    students: evaluationStudents,
    submissions: entregas,
    carrierIds,
  };
}

// Vista previa a pantalla completa. Aplica el filtro de la tabla de entregas.
// Va por encima de los dialogos (z-50) y debajo de los toasts (z-60).
export default function PdfPreviewScreen({ evaluationId, open: isOpen, filter, onClose }: Props) {
  const toast = useToast();
  const sourceState = useLoadState(
    () => (isOpen ? loadSource(evaluationId) : Promise.resolve(null)),
    [evaluationId, isOpen],
  );
  const source = sourceState.data;

  const [includeComments, setIncludeComments] = useState(true);
  const [includeNotDelivered, setIncludeNotDelivered] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("alfabetico");
  // Carpeta elegida en esta capa. Se ignora si es de otro vinculo grupo-asignatura.
  const [chosen, setChosen] = useState<{ linkId: number; path: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);

  const topic = source?.evaluation.topic ?? "";
  const folderName = sanitizeFolderName(topic);
  const folder =
    source && chosen?.linkId === source.link.id ? chosen.path : (source?.link.download_folder ?? null);
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "Todos";

  const reportOptions = useMemo<ReportOptions>(
    () => ({ includeComments, includeNotDelivered, sortBy, filter }),
    [includeComments, includeNotDelivered, sortBy, filter],
  );
  const reportData = useMemo(
    () => (source ? buildReportData(reportInput(source), reportOptions) : null),
    [source, reportOptions],
  );
  // Fecha de "Generado el": estable mientras la capa esta abierta.
  const generatedAt = useMemo(() => new Date().toLocaleDateString("es"), [isOpen]);

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

  // Captura en fase de captura: Escape cierra solo esta capa y no llega al dialogo de debajo.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function savePdf() {
    if (!source) return;
    if (folderName === "") {
      toast.show("El tema de la evaluación no sirve como nombre de carpeta");
      return;
    }
    setSaving(true);
    try {
      // Si la asignatura no tiene carpeta, la pide y la guarda en la asignatura.
      const base = await resolveSubjectFolder({ id: source.link.id, download_folder: folder });
      if (base === null) return;
      setChosen({ linkId: source.link.id, path: base });
      const dir = await join(base, folderName);
      const blob = await renderPdf(source, reportOptions);
      await mkdir(dir, { recursive: true });
      const file = await join(dir, pdfFileName(folderName, filter));
      await writeFile(file, new Uint8Array(await blob.arrayBuffer()));
      toast.show(
        `PDF guardado en ${file}`,
        {
          label: "Abrir carpeta",
          onClick: () => {
            openPath(dir).catch((err: unknown) => toast.show(errorMessage(err)));
          },
        },
        { variant: "success" },
      );
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col bg-app text-ink">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="font-semibold">Vista previa</h2>
          <span className="text-xs text-muted">Filtro: {filterLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
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
              className="accent-accent disabled:opacity-50"
              checked={filter === "todos" && includeNotDelivered}
              disabled={filter !== "todos"}
              onChange={(e) => setIncludeNotDelivered(e.target.checked)}
            />
            Incluir no entregados
          </label>
          <Field label="Orden">
            <Select
              value={sortBy}
              disabled={ESTADO_FILTERS.has(filter)}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              <option value="alfabetico">Alfabético</option>
              <option value="nota">Por nota (mayor a menor)</option>
            </Select>
          </Field>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="primary" disabled={!source || saving} onClick={() => void savePdf()}>
            Guardar PDF
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Salir
          </Button>
        </div>
      </div>
      <p
        className="shrink-0 truncate border-b border-line px-4 py-1 text-xs text-muted"
        title={folder === null ? undefined : (destination ?? folder)}
      >
        {folder === null ? "Sin carpeta de descargas (se pedirá al guardar)" : `Destino: ${destination ?? folder}`}
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
        {sourceState.error !== null ? (
          <div className="p-4">
            <LoadError message={sourceState.error} onRetry={sourceState.reload} />
          </div>
        ) : reportData === null ? (
          <p className="p-4 text-sm text-muted">Cargando datos...</p>
        ) : (
          <ReportPreview data={reportData} options={reportOptions} generatedAt={generatedAt} />
        )}
      </div>
    </div>,
    document.body,
  );
}

import { openPath } from "@tauri-apps/plugin-opener";
import { Download, FileText, FolderOpen, Pencil, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EvaluationFormDialog } from "../components/dialogs/EvaluationFormDialog";
import PdfExportDialog from "../components/pdf/PdfExportDialog";
import { SubmissionsTable, type SaveSubmission, type SubmissionRow } from "../components/evaluation/SubmissionsTable";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { LoadError } from "../components/ui/LoadError";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/useToast";
import { useDataVersion } from "../context/DataVersionContext";
import * as evaluations from "../db/evaluations";
import * as groupSubjects from "../db/groupSubjects";
import * as groups from "../db/groups";
import * as students from "../db/students";
import * as subjects from "../db/subjects";
import * as submissions from "../db/submissions";
import type { Evaluation as EvaluationRecord, Group, Student, Submission, Subject } from "../db/types";
import { checkGit } from "../lib/git";
import {
  downloadMany,
  isDownloading,
  readGitPath,
  resolveEvaluationFolder,
  studentFolders,
  topicFolderStatus,
} from "../lib/download";
import { formatDueDate } from "../lib/dueDate";
import { errorMessage } from "../lib/errorMessage";
import { isDelivered } from "../lib/submissionStatus";
import { useLoadState } from "../lib/useLoad";

interface EvaluationPage {
  evaluation: EvaluationRecord;
  subject: Subject;
  group: Group;
  students: Student[];
  rows: SubmissionRow[];
}

async function loadEvaluationPage(id: number): Promise<EvaluationPage | null> {
  const evaluation = await evaluations.get(id);
  if (!evaluation) return null;
  const link = await groupSubjects.get(evaluation.group_subject_id);
  if (!link) return null;
  const [group, subject, groupStudents, subs] = await Promise.all([
    groups.get(link.group_id),
    subjects.get(link.subject_id),
    students.listByGroup(link.group_id),
    submissions.listByEvaluation(id),
  ]);
  if (!group || !subject) return null;
  const studentById = new Map(groupStudents.map((s) => [s.id, s]));
  const rows: SubmissionRow[] = [];
  for (const submission of subs) {
    const student = studentById.get(submission.student_id);
    if (student) rows.push({ submission, student });
  }
  return { evaluation, subject, group, students: groupStudents, rows };
}

function ProgressStat({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums">
          {done} / {total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-hover" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-1 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Evaluation() {
  const { id } = useParams();
  const evaluationId = Number(id);
  const navigate = useNavigate();
  const { version, refresh } = useDataVersion();
  const toast = useToast();

  const pageState = useLoadState(
    () => (Number.isInteger(evaluationId) ? loadEvaluationPage(evaluationId) : Promise.resolve(null)),
    [evaluationId, version],
  );
  const page = pageState.data;

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  // Progreso de la descarga en curso (una a la vez). Si la pantalla se monta con una descarga activa,
  // el progreso se ve como indeterminado hasta que cambian los datos. La guardia real vive en download.ts.
  const [downloading, setDownloading] = useState<{ done: number; total: number } | null>(() =>
    isDownloading(evaluationId) ? { done: 0, total: 0 } : null,
  );
  // Cambios aplicados de forma optimista hasta que llega la recarga de datos.
  const [patches, setPatches] = useState<Record<number, Partial<Submission>>>({});

  useEffect(() => {
    setPatches({});
  }, [page]);

  // Sincroniza el estado de descarga con la guardia al cambiar los datos (por ejemplo, al terminar una corrida).
  useEffect(() => {
    if (isDownloading(evaluationId)) setDownloading((prev) => prev ?? { done: 0, total: 0 });
    else setDownloading(null);
  }, [evaluationId, version]);

  const saveSubmission: SaveSubmission = useCallback(
    async (submissionId, patch, write) => {
      setPatches((prev) => ({ ...prev, [submissionId]: { ...prev[submissionId], ...patch } }));
      try {
        await write();
      } catch (err) {
        setPatches((prev) => {
          const next = { ...prev };
          delete next[submissionId];
          return next;
        });
        toast.show(errorMessage(err));
      } finally {
        refresh();
      }
    },
    [refresh, toast],
  );

  const rows = useMemo<SubmissionRow[]>(
    () =>
      page
        ? page.rows.map((row) => ({
            ...row,
            submission: { ...row.submission, ...patches[row.submission.id] },
          }))
        : [],
    [page, patches],
  );

  // Carpeta del tema (ruta y si ya existe en disco). Se recalcula al cambiar datos, por ejemplo tras descargar.
  const subjectFolder = page?.subject.download_folder ?? null;
  const topicName = page?.evaluation.topic ?? null;
  const [topicStatus, setTopicStatus] = useState<{ path: string; exists: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (topicName === null) {
      setTopicStatus(null);
      return;
    }
    topicFolderStatus(subjectFolder, topicName)
      .catch(() => null)
      .then((status) => {
        if (!cancelled) setTopicStatus(status);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectFolder, topicName, version]);

  if (pageState.error !== null) return <LoadError message={pageState.error} onRetry={pageState.reload} />;
  if (page === undefined) return <p className="text-muted">Cargando...</p>;
  if (page === null) return <p className="text-muted">Evaluacion no encontrada.</p>;

  const { evaluation, subject, group, students: groupStudents } = page;
  const total = rows.length;
  const delivered = rows.filter((r) => isDelivered(r.submission)).length;
  const withLink = rows.filter((r) => r.submission.repo_url !== null);
  const downloaded = withLink.filter((r) => r.submission.download_status === "ok").length;
  const graded = rows.filter((r) => isDelivered(r.submission) && r.submission.grade !== null).length;

  // Descarga las filas indicadas (con repositorio). Sirve para "Descargar todos" y para una fila.
  async function runDownloads(targets: SubmissionRow[]) {
    const withRepo = targets.filter((r) => r.submission.repo_url !== null);
    if (withRepo.length === 0 || downloading !== null) return;
    setDownloading({ done: 0, total: withRepo.length });
    try {
      const gitPath = await readGitPath();
      await checkGit(gitPath ?? undefined);
      const topicFolder = await resolveEvaluationFolder(subject, evaluation.topic);
      if (topicFolder === null) return;

      const summary = await downloadMany(
        withRepo.map((row) => ({
          submission: row.submission,
          studentName: `${row.student.first_names} ${row.student.last_names}`,
        })),
        {
          evaluation,
          gitPath,
          topicFolder,
          folders: studentFolders(groupStudents),
          onProgress: (done, total) => setDownloading({ done, total }),
          onChange: refresh,
        },
      );
      const failedCount = summary.failed.length;
      toast.show(`${summary.ok} ok, ${failedCount} con error`, undefined, {
        variant: failedCount === 0 ? "success" : "error",
      });
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setDownloading(null);
      refresh();
    }
  }

  async function openEvaluationFolder() {
    if (!topicStatus?.exists) return;
    try {
      await openPath(topicStatus.path);
    } catch (err) {
      toast.show(errorMessage(err));
    }
  }

  const openFolderTitle =
    subjectFolder === null
      ? "La asignatura no tiene carpeta de descargas"
      : topicStatus?.exists === false
        ? "Todavia no existe la carpeta de este tema. Descarga los repositorios primero"
        : undefined;

  const failedDownloads = rows.filter((r) => r.submission.download_status === "error");

  async function deleteEvaluation() {
    if (busy) return;
    setBusy(true);
    try {
      await evaluations.remove(evaluation.id);
      setConfirmDelete(false);
      navigate(`/grupo/${group.id}`);
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{evaluation.topic}</h1>
          <p className="truncate text-muted">{evaluation.title}</p>
          <p className="text-muted">
            {subject.name} / {group.name} /{" "}
            {evaluation.due_date ? `Limite ${formatDueDate(evaluation.due_date)}` : "Sin limite"}
          </p>
          <p className="truncate text-sm text-muted" title={subjectFolder ?? undefined}>
            {subjectFolder === null
              ? "Sin carpeta de descargas (se pedira al descargar)"
              : `Descargas en: ${topicStatus?.path ?? subjectFolder}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void openEvaluationFolder()}
            disabled={!topicStatus?.exists}
            title={openFolderTitle}
          >
            <FolderOpen size={14} />
            Abrir carpeta
          </Button>
          <Button onClick={() => setEditing(true)} disabled={busy}>
            <Pencil size={14} />
            Editar
          </Button>
          <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 size={14} />
            Eliminar
          </Button>
        </div>
      </header>

      {failedDownloads.length > 0 && (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer font-medium">Errores de descarga ({failedDownloads.length})</summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {failedDownloads.map((row) => (
              <li key={row.submission.id}>
                <span className="font-medium">
                  {row.student.first_names} {row.student.last_names}
                </span>
                : <span className="text-danger">{row.submission.download_error}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {page.students.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title="Este grupo no tiene estudiantes"
          description="Agrega estudiantes al grupo para ver sus entregas aqui."
          action={
            <Button variant="primary" onClick={() => navigate(`/grupo/${group.id}`)}>
              Ir al grupo
            </Button>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <ProgressStat label="Entregaron" done={delivered} total={total} />
            <ProgressStat label="Descargados" done={downloaded} total={withLink.length} />
            <ProgressStat label="Calificados" done={graded} total={delivered} />
          </section>

          <div className="flex flex-wrap gap-2">
            <Button disabled={withLink.length === 0 || downloading !== null} onClick={() => void runDownloads(withLink)}>
              <Download size={14} />
              {downloading
                ? downloading.total === 0
                  ? "Descargando..."
                  : `Descargando ${downloading.done}/${downloading.total}`
                : "Descargar todos"}
            </Button>
            <Button onClick={() => setExporting(true)}>
              <FileText size={14} />
              Generar PDF
            </Button>
          </div>
          {downloading && (
            <div
              className="h-1 overflow-hidden rounded-full bg-hover"
              role="progressbar"
              aria-label="Progreso de descarga"
              aria-valuemin={0}
              aria-valuemax={downloading.total}
              aria-valuenow={downloading.done}
            >
              <div
                className="h-1 rounded-full bg-accent"
                style={{ width: `${downloading.total === 0 ? 0 : (downloading.done / downloading.total) * 100}%` }}
              />
            </div>
          )}

          <SubmissionsTable
            rows={rows}
            gradeMin={subject.grade_min}
            gradeMax={subject.grade_max}
            onSave={saveSubmission}
            downloading={downloading !== null}
            onDownload={(row) => runDownloads([row])}
          />
        </>
      )}

      {editing && (
        <EvaluationFormDialog
          groupSubjectId={evaluation.group_subject_id}
          evaluation={evaluation}
          onClose={() => setEditing(false)}
        />
      )}

      <PdfExportDialog evaluationId={evaluation.id} open={exporting} onClose={() => setExporting(false)} />

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar evaluacion"
        message={
          <>
            Se borraran la evaluacion {evaluation.topic} y sus entregas. Esta accion no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
        danger
        busy={busy}
        onConfirm={() => void deleteEvaluation()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

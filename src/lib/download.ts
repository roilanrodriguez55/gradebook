import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import * as settings from "../db/settings";
import * as subjects from "../db/subjects";
import * as submissions from "../db/submissions";
import type { Evaluation, Student, Submission, Subject } from "../db/types";
import { errorMessage } from "./errorMessage";
import { sanitizeFolderName, studentFolderName } from "./folderName";

const DOWNLOAD_CONCURRENCY = 3;

// Descargas en curso. Viven a nivel de modulo para que no se dupliquen aunque la pantalla se desmonte.
const evaluationsDownloading = new Set<number>();
const submissionsDownloading = new Set<number>();

// Indica si hay una descarga en curso para la evaluacion.
export function isDownloading(evaluationId: number): boolean {
  return evaluationsDownloading.has(evaluationId);
}

interface SyncResult {
  action: "clone" | "pull";
  sha: string;
  commitDate: string;
}

export type DownloadOutcome = { ok: true } | { ok: false; error: string };

export interface DownloadItem {
  submission: Submission;
  studentName: string;
}

export interface DownloadSummary {
  ok: number;
  failed: { studentName: string; error: string }[];
}

// Ruta de git que guardo el usuario en Ajustes, o null si esta vacia.
export async function readGitPath(): Promise<string | null> {
  const value = (await settings.get("git_path"))?.trim();
  return value ? value : null;
}

function topicFolderName(topic: string): string {
  const name = sanitizeFolderName(topic);
  if (name === "") throw new Error("El tema de la evaluacion no sirve como nombre de carpeta");
  return name;
}

// Carpeta del tema: <carpeta de la asignatura>/<tema sanitizado>.
export async function evaluationFolderPath(parent: string, topic: string): Promise<string> {
  return join(parent, topicFolderName(topic));
}

// Carpeta de descargas de la asignatura. Si no tiene, pide una y la guarda en la asignatura.
// Devuelve null si el usuario cancela el selector.
export async function resolveSubjectFolder(subject: Pick<Subject, "id" | "download_folder">): Promise<string | null> {
  const saved = subject.download_folder?.trim() ?? "";
  if (saved !== "") return saved;
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Elegir carpeta de descargas de la asignatura",
  });
  if (typeof picked !== "string") return null;
  await subjects.setDownloadFolder(subject.id, picked);
  return picked;
}

// Carpeta del tema dentro de la carpeta de la asignatura. Devuelve null si el usuario cancela el selector.
export async function resolveEvaluationFolder(
  subject: Pick<Subject, "id" | "download_folder">,
  topic: string,
): Promise<string | null> {
  const parent = await resolveSubjectFolder(subject);
  if (parent === null) return null;
  return evaluationFolderPath(parent, topic);
}

// Ruta de la carpeta del tema y si ya existe en disco. Null si la asignatura no tiene carpeta.
export async function topicFolderStatus(
  subjectFolder: string | null,
  topic: string,
): Promise<{ path: string; exists: boolean } | null> {
  if (!subjectFolder) return null;
  const path = await evaluationFolderPath(subjectFolder, topic);
  return { path, exists: await exists(path) };
}

// Nombre de carpeta por estudiante (id -> nombre). Los repetidos reciben _2, _3 en orden de id.
export function studentFolders(students: Student[]): Map<number, string> {
  const seen = new Map<string, number>();
  const names = new Map<number, string>();
  for (const student of [...students].sort((a, b) => a.id - b.id)) {
    const base = studentFolderName(student.first_names, student.last_names);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    names.set(student.id, count === 1 ? base : `${base}_${count}`);
  }
  return names;
}

// Fin del dia limite en hora local (23:59:59). Compara con la fecha del ultimo commit.
function isAfterDueDay(dueDate: string, commitDate: string): boolean {
  const [year, month, day] = dueDate.split("-").map(Number);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59);
  return new Date(commitDate).getTime() > endOfDay.getTime();
}

interface DownloadOptions {
  evaluation: Evaluation;
  gitPath: string | null;
  onStart?: () => void;
}

// Clona o actualiza la entrega en `dest` y guarda el resultado. Los errores de git no se lanzan:
// quedan en download_status 'error' y se devuelven en el resultado.
export async function downloadSubmission(
  submission: Submission,
  dest: string,
  options: DownloadOptions,
): Promise<DownloadOutcome> {
  const { evaluation, gitPath } = options;
  if (!submission.repo_url) return { ok: false, error: "La entrega no tiene repositorio" };
  if (submissionsDownloading.has(submission.id)) {
    return { ok: false, error: "Ya hay una descarga en curso para esta entrega" };
  }

  submissionsDownloading.add(submission.id);
  try {
    await submissions.setDownloading(submission.id);
    options.onStart?.();
    try {
      const result = await invoke<SyncResult>("sync_repo", {
        url: submission.repo_url,
        dest,
        gitPath,
      });
      await submissions.setDownloadResult(submission.id, {
        downloadStatus: "ok",
        localPath: dest,
        lastCommitSha: result.sha,
        lastCommitDate: result.commitDate,
      });
      const late = evaluation.due_date !== null && isAfterDueDay(evaluation.due_date, result.commitDate);
      if (late && submission.status === "entregado") {
        await submissions.setStatus(submission.id, "tardia");
      }
      return { ok: true };
    } catch (err) {
      const error = errorMessage(err);
      await submissions.setDownloadResult(submission.id, {
        downloadStatus: "error",
        downloadError: error,
      });
      return { ok: false, error };
    }
  } finally {
    submissionsDownloading.delete(submission.id);
  }
}

interface DownloadManyOptions extends Omit<DownloadOptions, "onStart"> {
  topicFolder: string;
  // Nombre de carpeta por id de estudiante, de studentFolders.
  folders: Map<number, string>;
  onProgress?: (done: number, total: number) => void;
  onChange?: () => void;
}

// Descarga las entregas con repositorio, de a DOWNLOAD_CONCURRENCY. No se detiene ante un fallo.
// Rechaza la llamada si ya hay una descarga en curso para la misma evaluacion.
export async function downloadMany(
  items: DownloadItem[],
  options: DownloadManyOptions,
): Promise<DownloadSummary> {
  const evaluationId = options.evaluation.id;
  if (evaluationsDownloading.has(evaluationId)) {
    throw new Error("Ya hay una descarga en curso para esta evaluacion");
  }
  evaluationsDownloading.add(evaluationId);
  try {
    return await runDownloadMany(items, options);
  } finally {
    evaluationsDownloading.delete(evaluationId);
  }
}

async function runDownloadMany(items: DownloadItem[], options: DownloadManyOptions): Promise<DownloadSummary> {
  const queue = items.filter((item) => item.submission.repo_url !== null);
  const summary: DownloadSummary = { ok: 0, failed: [] };
  let next = 0;
  let done = 0;
  options.onProgress?.(0, queue.length);

  async function worker(): Promise<void> {
    while (next < queue.length) {
      const item = queue[next];
      next += 1;
      let outcome: DownloadOutcome;
      try {
        const folderName = options.folders.get(item.submission.student_id);
        if (folderName === undefined) throw new Error("Estudiante sin carpeta asignada");
        const dest = await join(options.topicFolder, folderName);
        outcome = await downloadSubmission(item.submission, dest, {
          evaluation: options.evaluation,
          gitPath: options.gitPath,
          onStart: options.onChange,
        });
      } catch (err) {
        outcome = { ok: false, error: errorMessage(err) };
      }
      if (outcome.ok) {
        summary.ok += 1;
      } else {
        summary.failed.push({ studentName: item.studentName, error: outcome.error });
      }
      done += 1;
      options.onProgress?.(done, queue.length);
      options.onChange?.();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) }, () => worker()),
  );
  return summary;
}

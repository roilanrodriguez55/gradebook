import { getDb } from "./client";
import { validateGrade } from "../lib/grade";
import { normalizeGithubUrl } from "../lib/repoUrl";
import type { DownloadStatus, Submission, SubmissionStatus } from "./types";

export async function listByEvaluation(evaluationId: number): Promise<Submission[]> {
  const db = await getDb();
  return db.select<Submission[]>(
    `SELECT sub.* FROM submissions sub
     JOIN students st ON st.id = sub.student_id
     WHERE sub.evaluation_id = ?
     ORDER BY st.last_names, st.first_names`,
    [evaluationId],
  );
}

export async function get(id: number): Promise<Submission | null> {
  const db = await getDb();
  const rows = await db.select<Submission[]>("SELECT * FROM submissions WHERE id = ?", [id]);
  return rows[0] ?? null;
}

// Lanza error si la URL no es un repositorio de GitHub valido. Guarda la URL normalizada.
export async function setRepoUrl(id: number, repoUrl: string | null): Promise<void> {
  let normalized: string | null = null;
  if (repoUrl !== null) {
    normalized = normalizeGithubUrl(repoUrl);
    if (normalized === null) throw new Error(`URL de GitHub invalida: ${repoUrl}`);
  }
  const db = await getDb();
  await db.execute("UPDATE submissions SET repo_url = ? WHERE id = ?", [normalized, id]);
}

// null borra la nota. Valida contra la escala de la asignatura y guarda la nota redondeada a 2 decimales.
export async function setGrade(id: number, grade: number | null): Promise<void> {
  const db = await getDb();
  let value: number | null = null;
  if (grade !== null) {
    const rows = await db.select<{ grade_min: number; grade_max: number }[]>(
      `SELECT sj.grade_min, sj.grade_max FROM submissions sub
       JOIN evaluations e ON e.id = sub.evaluation_id
       JOIN group_subjects gs ON gs.id = e.group_subject_id
       JOIN subjects sj ON sj.id = gs.subject_id
       WHERE sub.id = ?`,
      [id],
    );
    if (rows.length === 0) throw new Error(`Entrega ${id} no existe`);
    const { grade_min: min, grade_max: max } = rows[0];
    const check = validateGrade(grade, min, max);
    if (!check.ok) throw new Error(`La nota debe estar entre ${min} y ${max}`);
    value = check.value;
  }
  await db.execute("UPDATE submissions SET grade = ? WHERE id = ?", [value, id]);
}

export async function setStatus(id: number, status: SubmissionStatus): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE submissions SET status = ? WHERE id = ?", [status, id]);
}

export async function setDownloading(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE submissions SET download_status = 'descargando', download_error = NULL WHERE id = ?",
    [id],
  );
}

export async function setDownloadResult(
  id: number,
  result: {
    downloadStatus: DownloadStatus;
    downloadError?: string | null;
    localPath?: string | null;
    lastCommitSha?: string | null;
    lastCommitDate?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE submissions
     SET download_status = ?, download_error = ?, local_path = ?, last_commit_sha = ?, last_commit_date = ?
     WHERE id = ?`,
    [
      result.downloadStatus,
      result.downloadError ?? null,
      result.localPath ?? null,
      result.lastCommitSha ?? null,
      result.lastCommitDate ?? null,
      id,
    ],
  );
}

// null borra el comentario.
export async function setComment(id: number, comment: string | null): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE submissions SET comment = ? WHERE id = ?", [comment, id]);
}

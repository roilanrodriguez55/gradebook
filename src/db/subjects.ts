import { getDb, insertRow, updateRow } from "./client";
import * as settings from "./settings";
import { scaleError } from "../lib/grade";
import type { Subject } from "./types";

const FALLBACK_GRADE_MIN = 2;
const FALLBACK_GRADE_MAX = 5;

export async function list(): Promise<Subject[]> {
  const db = await getDb();
  return db.select<Subject[]>("SELECT * FROM subjects ORDER BY name");
}

export async function get(id: number): Promise<Subject | null> {
  const db = await getDb();
  const rows = await db.select<Subject[]>("SELECT * FROM subjects WHERE id = ?", [id]);
  return rows[0] ?? null;
}

// Escala por defecto desde Ajustes. Si falta o no es valida, usa 2 y 5.
async function defaultScale(): Promise<{ min: number; max: number }> {
  const [rawMin, rawMax] = await Promise.all([
    settings.get("default_grade_min"),
    settings.get("default_grade_max"),
  ]);
  const min = rawMin === null ? NaN : Number(rawMin);
  const max = rawMax === null ? NaN : Number(rawMax);
  if (scaleError(min, max) !== null) return { min: FALLBACK_GRADE_MIN, max: FALLBACK_GRADE_MAX };
  return { min, max };
}

export async function create(input: { name: string; grade_min?: number; grade_max?: number }): Promise<Subject> {
  const scale =
    input.grade_min !== undefined && input.grade_max !== undefined
      ? { min: input.grade_min, max: input.grade_max }
      : await defaultScale();
  const error = scaleError(scale.min, scale.max);
  if (error !== null) throw new Error(error);
  const id = await insertRow(
    "INSERT INTO subjects (name, grade_min, grade_max) VALUES (?, ?, ?)",
    [input.name, scale.min, scale.max],
  );
  const subject = await get(id);
  if (!subject) throw new Error(`Materia ${id} no encontrada tras insertar`);
  return subject;
}

// Cambia la escala de la asignatura para todos sus grupos. Falla si alguna nota guardada quedaria fuera.
export async function updateScale(id: number, min: number, max: number): Promise<void> {
  const error = scaleError(min, max);
  if (error !== null) throw new Error(error);
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM submissions sub
     JOIN evaluations e ON e.id = sub.evaluation_id
     JOIN group_subjects gs ON gs.id = e.group_subject_id
     WHERE gs.subject_id = ? AND sub.grade IS NOT NULL AND (sub.grade < ? OR sub.grade > ?)`,
    [id, min, max],
  );
  const outside = rows[0]?.n ?? 0;
  if (outside > 0) {
    const notes = outside === 1 ? "1 nota queda" : `${outside} notas quedan`;
    throw new Error(`${notes} fuera de la escala ${min}-${max}. Corrigelas antes de cambiarla.`);
  }
  await db.execute("UPDATE subjects SET grade_min = ?, grade_max = ? WHERE id = ?", [min, max, id]);
}

// Carpeta donde se guardan los repos del tema y el PDF. Una cadena vacia la borra (queda null).
export async function setDownloadFolder(id: number, path: string | null): Promise<void> {
  const value = path?.trim() ? path.trim() : null;
  const db = await getDb();
  await db.execute("UPDATE subjects SET download_folder = ? WHERE id = ?", [value, id]);
}

export async function update(id: number, fields: Partial<Pick<Subject, "name">>): Promise<void> {
  await updateRow("subjects", id, fields, ["name"]);
}

export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM subjects WHERE id = ?", [id]);
}

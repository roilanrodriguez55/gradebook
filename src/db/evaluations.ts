import { getDb, insertRow, updateRow } from "./client";
import type { Evaluation } from "./types";

export async function listByGroupSubject(groupSubjectId: number): Promise<Evaluation[]> {
  const db = await getDb();
  return db.select<Evaluation[]>(
    "SELECT * FROM evaluations WHERE group_subject_id = ? ORDER BY id",
    [groupSubjectId],
  );
}

export async function get(id: number): Promise<Evaluation | null> {
  const db = await getDb();
  const rows = await db.select<Evaluation[]>("SELECT * FROM evaluations WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function create(
  groupSubjectId: number,
  input: { title: string; topic: string; due_date?: string | null },
): Promise<Evaluation> {
  // max_score ya no se usa: se rellena con la nota maxima de la asignatura para cumplir el NOT NULL.
  const id = await insertRow(
    `INSERT INTO evaluations (group_subject_id, title, topic, due_date, max_score)
     VALUES (?, ?, ?, ?, (
       SELECT sj.grade_max FROM group_subjects gs
       JOIN subjects sj ON sj.id = gs.subject_id
       WHERE gs.id = ?
     ))`,
    [groupSubjectId, input.title, input.topic, input.due_date ?? null, groupSubjectId],
  );
  try {
    const db = await getDb();
    await db.execute(
      `INSERT INTO submissions (evaluation_id, student_id, status)
       SELECT ?, s.id, 'pendiente'
       FROM students s
       JOIN group_subjects gs ON gs.group_id = s.group_id
       WHERE gs.id = ?`,
      [id, groupSubjectId],
    );
  } catch (err) {
    // Sin transacciones entre llamadas: deshace la evaluacion si fallo la creacion de entregas.
    await (await getDb()).execute("DELETE FROM evaluations WHERE id = ?", [id]);
    throw err;
  }
  const evaluation = await get(id);
  if (!evaluation) throw new Error(`Evaluacion ${id} no encontrada tras insertar`);
  return evaluation;
}

export async function update(
  id: number,
  fields: Partial<Pick<Evaluation, "title" | "topic" | "due_date">>,
): Promise<void> {
  await updateRow("evaluations", id, fields, ["title", "topic", "due_date"]);
}

export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM evaluations WHERE id = ?", [id]);
}

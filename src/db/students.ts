import { getDb, insertRow, updateRow } from "./client";
import type { Student } from "./types";

type StudentInput = { first_names: string; last_names: string; github_user?: string | null };

// Crea la submission 'pendiente' de este estudiante en cada evaluacion de sus grupos-materia.
async function addPendingSubmissions(studentId: number, groupId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO submissions (evaluation_id, student_id, status)
     SELECT e.id, ?, 'pendiente'
     FROM evaluations e
     JOIN group_subjects gs ON gs.id = e.group_subject_id
     WHERE gs.group_id = ?`,
    [studentId, groupId],
  );
}

export async function listByGroup(groupId: number): Promise<Student[]> {
  const db = await getDb();
  return db.select<Student[]>(
    "SELECT * FROM students WHERE group_id = ? ORDER BY last_names, first_names",
    [groupId],
  );
}

export async function get(id: number): Promise<Student | null> {
  const db = await getDb();
  const rows = await db.select<Student[]>("SELECT * FROM students WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function create(groupId: number, input: StudentInput): Promise<Student> {
  const id = await insertRow(
    "INSERT INTO students (group_id, first_names, last_names, github_user) VALUES (?, ?, ?, ?)",
    [groupId, input.first_names, input.last_names, input.github_user ?? null],
  );
  await addPendingSubmissions(id, groupId);
  const student = await get(id);
  if (!student) throw new Error(`Estudiante ${id} no encontrado tras insertar`);
  return student;
}

export async function createMany(
  groupId: number,
  list: { firstNames: string; lastNames: string }[],
): Promise<Student[]> {
  const created: Student[] = [];
  for (const s of list) {
    created.push(
      await create(groupId, { first_names: s.firstNames, last_names: s.lastNames }),
    );
  }
  return created;
}

export async function update(
  id: number,
  fields: Partial<Pick<Student, "first_names" | "last_names" | "github_user">>,
): Promise<void> {
  await updateRow("students", id, fields, ["first_names", "last_names", "github_user"]);
}

export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM students WHERE id = ?", [id]);
}

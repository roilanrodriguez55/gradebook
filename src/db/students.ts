import { getDb, insertRow, updateRow } from "./client";
import type { Carry, CarryOption, Student, StudentInGroup } from "./types";

type StudentInput = { first_names: string; last_names: string; github_user?: string | null };

// Crea la submission 'pendiente' de este estudiante en cada evaluacion de los grupos-materia del grupo.
async function addPendingSubmissions(studentId: number, groupId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO submissions (evaluation_id, student_id, status)
     SELECT e.id, ?, 'pendiente'
     FROM evaluations e
     JOIN group_subjects gs ON gs.id = e.group_subject_id
     WHERE gs.group_id = ?`,
    [studentId, groupId],
  );
}

async function enroll(studentId: number, groupId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR IGNORE INTO enrollments (student_id, group_id) VALUES (?, ?)",
    [studentId, groupId],
  );
}

export async function listByGroup(groupId: number): Promise<StudentInGroup[]> {
  const db = await getDb();
  return db.select<StudentInGroup[]>(
    `SELECT st.*, en.promoted_to_group_id
     FROM enrollments en
     JOIN students st ON st.id = en.student_id
     WHERE en.group_id = ?
     ORDER BY st.last_names, st.first_names`,
    [groupId],
  );
}

// Estudiantes con entrega en la evaluacion (incluye arrastres, no solo los del grupo).
export async function listByEvaluation(evaluationId: number): Promise<Student[]> {
  const db = await getDb();
  return db.select<Student[]>(
    `SELECT st.* FROM students st
     JOIN submissions sub ON sub.student_id = st.id
     WHERE sub.evaluation_id = ?
     ORDER BY st.last_names, st.first_names`,
    [evaluationId],
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
  try {
    await enroll(id, groupId);
    await addPendingSubmissions(id, groupId);
  } catch (err) {
    // Sin transacciones entre llamadas: deshace el estudiante si fallo la matricula o las entregas.
    await (await getDb()).execute("DELETE FROM students WHERE id = ?", [id]);
    throw err;
  }
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

// students.group_id es una columna legada con ON DELETE CASCADE: antes de borrar un grupo (o quitar
// a un estudiante de el) se reapunta a otra matricula para que el borrado no arrastre al estudiante.
export async function repointLegacyGroup(groupId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE students
     SET group_id = (
       SELECT MIN(en.group_id) FROM enrollments en
       WHERE en.student_id = students.id AND en.group_id <> ?
     )
     WHERE group_id = ? AND EXISTS (
       SELECT 1 FROM enrollments en WHERE en.student_id = students.id AND en.group_id <> ?
     )`,
    [groupId, groupId, groupId],
  );
}

// Quita la matricula del grupo y sus entregas en las evaluaciones de ese grupo.
// Borra la fila de students solo si ya no tiene matriculas ni arrastres (los arrastres se borrarian en cascada).
export async function removeFromGroup(studentId: number, groupId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM submissions
     WHERE student_id = ? AND evaluation_id IN (
       SELECT e.id FROM evaluations e
       JOIN group_subjects gs ON gs.id = e.group_subject_id
       WHERE gs.group_id = ?
     )`,
    [studentId, groupId],
  );
  await db.execute("DELETE FROM enrollments WHERE student_id = ? AND group_id = ?", [
    studentId,
    groupId,
  ]);
  await repointLegacyGroup(groupId);
  await db.execute(
    `DELETE FROM students
     WHERE id = ?
       AND NOT EXISTS (SELECT 1 FROM enrollments WHERE student_id = ?)
       AND NOT EXISTS (SELECT 1 FROM carries WHERE student_id = ?)`,
    [studentId, studentId, studentId],
  );
}

// Matricula en el grupo destino y marca la matricula de origen como promovida.
// No toca las entregas del origen.
export async function promote(
  studentIds: number[],
  fromGroupId: number,
  toGroupId: number,
): Promise<void> {
  if (fromGroupId === toGroupId) throw new Error("El grupo destino debe ser distinto del origen");
  const db = await getDb();
  for (const studentId of studentIds) {
    await enroll(studentId, toGroupId);
    await addPendingSubmissions(studentId, toGroupId);
    await db.execute(
      "UPDATE enrollments SET promoted_to_group_id = ? WHERE student_id = ? AND group_id = ?",
      [toGroupId, studentId, fromGroupId],
    );
  }
}

export async function listCarries(studentId: number): Promise<Carry[]> {
  const db = await getDb();
  return db.select<Carry[]>("SELECT * FROM carries WHERE student_id = ? ORDER BY id", [studentId]);
}

// Asignaturas de otros grupos que el estudiante puede arrastrar.
export async function listCarryOptions(excludeGroupId: number): Promise<CarryOption[]> {
  const db = await getDb();
  return db.select<CarryOption[]>(
    `SELECT gs.id AS group_subject_id, sj.name AS subject_name, g.name AS group_name, c.name AS course_name
     FROM group_subjects gs
     JOIN subjects sj ON sj.id = gs.subject_id
     JOIN groups g ON g.id = gs.group_id
     LEFT JOIN courses c ON c.id = g.course_id
     WHERE gs.group_id <> ?
     ORDER BY c.name, g.name, sj.name`,
    [excludeGroupId],
  );
}

// Reemplaza los arrastres del estudiante. Al quitar uno, borra solo sus entregas pendientes sin datos.
export async function setCarries(studentId: number, groupSubjectIds: number[]): Promise<void> {
  const db = await getDb();
  // Una asignatura de un grupo donde el estudiante ya esta matriculado no es arrastre.
  const enrolled = await db.select<{ id: number }[]>(
    `SELECT gs.id FROM group_subjects gs
     JOIN enrollments en ON en.group_id = gs.group_id
     WHERE en.student_id = ?`,
    [studentId],
  );
  const own = new Set(enrolled.map((r) => r.id));
  const wanted = new Set(groupSubjectIds.filter((id) => !own.has(id)));
  const current = (await listCarries(studentId)).map((c) => c.group_subject_id);

  for (const groupSubjectId of wanted) {
    await db.execute(
      "INSERT OR IGNORE INTO carries (student_id, group_subject_id) VALUES (?, ?)",
      [studentId, groupSubjectId],
    );
    await db.execute(
      `INSERT OR IGNORE INTO submissions (evaluation_id, student_id, status)
       SELECT e.id, ?, 'pendiente' FROM evaluations e WHERE e.group_subject_id = ?`,
      [studentId, groupSubjectId],
    );
  }

  for (const groupSubjectId of current) {
    if (wanted.has(groupSubjectId)) continue;
    await db.execute("DELETE FROM carries WHERE student_id = ? AND group_subject_id = ?", [
      studentId,
      groupSubjectId,
    ]);
    await db.execute(
      `DELETE FROM submissions
       WHERE student_id = ? AND status = 'pendiente'
         AND repo_url IS NULL AND grade IS NULL AND comment IS NULL
         AND evaluation_id IN (SELECT id FROM evaluations WHERE group_subject_id = ?)`,
      [studentId, groupSubjectId],
    );
  }
}

// Estudiantes que arrastran la asignatura de la evaluacion.
export async function carrierIdsByEvaluation(evaluationId: number): Promise<Set<number>> {
  const db = await getDb();
  const rows = await db.select<{ student_id: number }[]>(
    `SELECT c.student_id
     FROM carries c
     JOIN evaluations e ON e.group_subject_id = c.group_subject_id
     WHERE e.id = ?`,
    [evaluationId],
  );
  return new Set(rows.map((r) => r.student_id));
}

// Cantidad de asignaturas arrastradas por cada estudiante matriculado en el grupo.
export async function carryCountsByGroup(groupId: number): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = await db.select<{ student_id: number; n: number }[]>(
    `SELECT en.student_id, COUNT(c.id) AS n
     FROM enrollments en
     LEFT JOIN carries c ON c.student_id = en.student_id
     WHERE en.group_id = ?
     GROUP BY en.student_id`,
    [groupId],
  );
  return new Map(rows.map((r) => [r.student_id, r.n]));
}

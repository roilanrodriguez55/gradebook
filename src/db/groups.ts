import { getDb, insertRow, updateRow } from "./client";
import { repointLegacyGroup } from "./students";
import { groupName } from "../lib/grades";
import type { Group, Modality } from "./types";

export async function list(includeArchived = false): Promise<Group[]> {
  const db = await getDb();
  return db.select<Group[]>(
    `SELECT * FROM groups ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY id`,
  );
}

export async function get(id: number): Promise<Group | null> {
  const db = await getDb();
  const rows = await db.select<Group[]>("SELECT * FROM groups WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function create(input: {
  grade: number;
  modality: Modality;
  course_id?: number | null;
  semester?: 1 | 2;
}): Promise<Group> {
  const id = await insertRow(
    "INSERT INTO groups (name, course_id, grade, modality, semester) VALUES (?, ?, ?, ?, ?)",
    [
      groupName(input.grade, input.modality),
      input.course_id ?? null,
      input.grade,
      input.modality,
      input.semester ?? 1,
    ],
  );
  const group = await get(id);
  if (!group) throw new Error(`Grupo ${id} no encontrado tras insertar`);
  return group;
}

// Grupo del curso con ese grado, modalidad y semestre; si no existe lo crea.
export async function findOrCreate(input: {
  grade: number;
  modality: Modality;
  course_id: number | null;
  semester: 1 | 2;
}): Promise<Group> {
  const db = await getDb();
  const rows = await db.select<Group[]>(
    `SELECT * FROM groups
     WHERE grade = ? AND modality = ? AND semester = ? AND archived = 0 AND course_id IS ?
     ORDER BY id LIMIT 1`,
    [input.grade, input.modality, input.semester, input.course_id],
  );
  return rows[0] ?? create(input);
}

// La modalidad solo se fija si el grupo no tiene una (legacy). Si ya la tiene, no se edita.
// Al cambiar el grado o la modalidad se regenera el nombre.
export async function update(
  id: number,
  fields: {
    grade?: number;
    course_id?: number | null;
    archived?: number;
    modality?: Modality;
    semester?: 1 | 2;
  },
): Promise<void> {
  const current = await get(id);
  if (!current) throw new Error(`Grupo ${id} no encontrado`);
  if (fields.modality !== undefined && current.modality !== null) {
    throw new Error(`El grupo ${id} ya tiene modalidad ${current.modality}`);
  }
  const patch: Partial<Pick<Group, "name" | "archived" | "course_id" | "grade" | "modality" | "semester">> = {
    archived: fields.archived,
    course_id: fields.course_id,
    grade: fields.grade,
    modality: fields.modality,
    semester: fields.semester,
  };
  const nextGrade = fields.grade ?? current.grade;
  const nextModality = fields.modality ?? current.modality;
  if ((fields.grade !== undefined || fields.modality !== undefined) && nextGrade !== null && nextModality !== null) {
    patch.name = groupName(nextGrade, nextModality);
  }
  await updateRow("groups", id, patch, ["name", "archived", "course_id", "grade", "modality", "semester"]);
}

export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await repointLegacyGroup(id);
  await db.execute("DELETE FROM groups WHERE id = ?", [id]);
}

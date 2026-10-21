import { getDb, insertRow } from "./client";
import type { GroupSubject } from "./types";

export async function listByGroup(groupId: number): Promise<GroupSubject[]> {
  const db = await getDb();
  return db.select<GroupSubject[]>(
    "SELECT * FROM group_subjects WHERE group_id = ? ORDER BY id",
    [groupId],
  );
}

export async function get(id: number): Promise<GroupSubject | null> {
  const db = await getDb();
  const rows = await db.select<GroupSubject[]>("SELECT * FROM group_subjects WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function create(input: { groupId: number; subjectId: number }): Promise<GroupSubject> {
  const id = await insertRow("INSERT INTO group_subjects (group_id, subject_id) VALUES (?, ?)", [
    input.groupId,
    input.subjectId,
  ]);
  const row = await get(id);
  if (!row) throw new Error(`Relacion ${id} no encontrada tras insertar`);
  return row;
}

export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM group_subjects WHERE id = ?", [id]);
}

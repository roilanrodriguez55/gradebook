import { getDb, insertRow, updateRow } from "./client";
import { repointLegacyGroup } from "./students";
import type { Group } from "./types";

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
  name: string;
  period?: string | null;
  course_id?: number | null;
}): Promise<Group> {
  const id = await insertRow("INSERT INTO groups (name, period, course_id) VALUES (?, ?, ?)", [
    input.name,
    input.period ?? null,
    input.course_id ?? null,
  ]);
  const group = await get(id);
  if (!group) throw new Error(`Grupo ${id} no encontrado tras insertar`);
  return group;
}

export async function update(
  id: number,
  fields: Partial<Pick<Group, "name" | "period" | "archived" | "course_id">>,
): Promise<void> {
  await updateRow("groups", id, fields, ["name", "period", "archived", "course_id"]);
}

export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await repointLegacyGroup(id);
  await db.execute("DELETE FROM groups WHERE id = ?", [id]);
}

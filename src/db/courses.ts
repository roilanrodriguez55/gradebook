import { getDb, insertRow, updateRow } from "./client";
import type { Course } from "./types";

export async function list(): Promise<Course[]> {
  const db = await getDb();
  return db.select<Course[]>("SELECT * FROM courses ORDER BY name");
}

export async function get(id: number): Promise<Course | null> {
  const db = await getDb();
  const rows = await db.select<Course[]>("SELECT * FROM courses WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function create(input: { name: string }): Promise<Course> {
  const id = await insertRow("INSERT INTO courses (name) VALUES (?)", [input.name]);
  const course = await get(id);
  if (!course) throw new Error(`Curso ${id} no encontrado tras insertar`);
  return course;
}

export async function update(id: number, fields: Partial<Pick<Course, "name">>): Promise<void> {
  await updateRow("courses", id, fields, ["name"]);
}

export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM courses WHERE id = ?", [id]);
}

import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = invoke<string>("db_path")
      .then((path) => Database.load(`sqlite:${path}`))
      .then(async (db) => {
        await db.execute("PRAGMA foreign_keys = ON");
        return db;
      })
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}

export async function insertRow(sql: string, params: unknown[]): Promise<number> {
  const db = await getDb();
  const res = await db.execute(sql, params);
  if (res.lastInsertId === undefined) throw new Error("INSERT sin lastInsertId");
  return res.lastInsertId;
}

export async function updateRow(
  table: string,
  id: number,
  fields: Record<string, unknown>,
  allowed: readonly string[],
): Promise<void> {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  for (const k of keys) {
    if (!allowed.includes(k)) throw new Error(`Campo no permitido: ${k}`);
  }
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = ?`).join(", ");
  const db = await getDb();
  await db.execute(
    `UPDATE ${table} SET ${set} WHERE id = ?`,
    [...keys.map((k) => fields[k]), id],
  );
}

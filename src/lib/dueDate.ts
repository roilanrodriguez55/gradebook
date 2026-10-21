const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Recibe YYYY-MM-DD y devuelve "dd mmm". Se parsea a mano para no desplazar el dia por la zona horaria.
export function formatDueDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  if (!month || !day || month < 1 || month > 12) return iso;
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]}`;
}

// Recibe YYYY-MM-DD y devuelve "dd mmm yyyy" (ej. "21 oct 2026").
export function formatDueDateLong(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return `${formatDueDate(iso)} ${date.getFullYear()}`;
}

// Convierte YYYY-MM-DD en un Date local a las 00:00. Devuelve undefined si no es una fecha real.
export function parseIsoDate(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? date : undefined;
}

// Inversa de parseIsoDate: usa los campos locales del Date para no desplazar el dia.
export function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

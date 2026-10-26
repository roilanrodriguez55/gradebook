import type { Evaluation, Student, Submission } from "../db/types";
import { FILTERS, matchesFilter, type FilterKey } from "../lib/submissionFilter";

export type SortBy = "alfabetico" | "nota";

export interface ReportInput {
  evaluation: Evaluation;
  subjectName: string;
  // Nota maxima de la escala de la asignatura (Subject.grade_max).
  gradeMax: number;
  groupName: string;
  groupPeriod: string | null;
  teacherName?: string | null;
  students: Student[];
  submissions: Submission[];
  // Estudiantes que arrastran la asignatura de la evaluacion.
  carrierIds?: Set<number>;
}

export interface ReportOptions {
  includeComments: boolean;
  includeNotDelivered: boolean;
  sortBy: SortBy;
  filter: FilterKey;
}

export interface ReportRow {
  n: number;
  nombre: string;
  nota: number | null;
  notaMax: number;
  comentario: string;
  tardia: boolean;
  arrastre: boolean;
}

export interface ReportStats {
  promedio: number | null;
  maxima: number | null;
  minima: number | null;
  entregaron: number;
  total: number;
}

export interface ReportData {
  titulo: string;
  // Titulo de la evaluacion; `titulo` lleva el tema.
  descripcion: string;
  // Etiqueta del filtro aplicado (ej. "Entregados"); null con "todos".
  filtroEtiqueta: string | null;
  asignatura: string;
  grupo: string;
  periodo: string | null;
  profesor: string | null;
  fechaLimite: string | null;
  filas: ReportRow[];
  noEntregaron: string[];
  estadisticas: ReportStats;
}

const collator = new Intl.Collator("es");

const DELIVERED_STATUSES: ReadonlySet<string> = new Set(["entregado", "tardia"]);

// Se muestra "Nombres Apellidos", pero el orden es por apellidos y luego nombres.
function fullName(student: Student): string {
  return `${student.first_names.trim()} ${student.last_names.trim()}`;
}

function compareStudents(a: Student, b: Student): number {
  return collator.compare(a.last_names, b.last_names) || collator.compare(a.first_names, b.first_names);
}

// Funcion pura: arma los datos del informe a partir de la evaluacion, el grupo y las entregas.
export function buildReportData(input: ReportInput, options: ReportOptions): ReportData {
  const submissionByStudent = new Map(input.submissions.map((s) => [s.student_id, s]));
  const carrierIds = input.carrierIds ?? new Set<number>();
  const filtered = options.filter !== "todos";

  const delivered: ReportRow[] = [];
  const notDelivered: string[] = [];
  let total = 0;

  // Los estudiantes llegan ordenados por apellidos y nombres, y el sort es estable: el orden se conserva.
  for (const student of [...input.students].sort(compareStudents)) {
    const nombre = fullName(student);
    const submission = submissionByStudent.get(student.id);
    const arrastre = carrierIds.has(student.id);
    // Con un filtro activo, un estudiante sin entrega no cumple ningun filtro.
    if (filtered && (!submission || !matchesFilter(submission, options.filter))) continue;
    total++;
    if (!submission || !DELIVERED_STATUSES.has(submission.status)) {
      notDelivered.push(arrastre ? `${nombre} (arrastre)` : nombre);
      continue;
    }
    delivered.push({
      n: 0,
      nombre,
      nota: submission.grade,
      notaMax: input.gradeMax,
      comentario: options.includeComments ? (submission.comment ?? "").trim() : "",
      tardia: submission.status === "tardia",
      arrastre,
    });
  }

  delivered.sort((a, b) => {
    if (options.sortBy === "nota" && a.nota !== b.nota) {
      if (a.nota === null) return 1;
      if (b.nota === null) return -1;
      return b.nota - a.nota;
    }
    return 0;
  });
  const filas = delivered.map((row, i) => ({ ...row, n: i + 1 }));

  const grades = filas.flatMap((row) => (row.nota === null ? [] : [row.nota]));
  const estadisticas: ReportStats = {
    promedio: grades.length === 0 ? null : grades.reduce((sum, g) => sum + g, 0) / grades.length,
    maxima: grades.length === 0 ? null : Math.max(...grades),
    minima: grades.length === 0 ? null : Math.min(...grades),
    entregaron: delivered.length,
    total,
  };

  return {
    titulo: input.evaluation.topic,
    descripcion: input.evaluation.title.trim(),
    filtroEtiqueta: filtered ? (FILTERS.find((f) => f.key === options.filter)?.label ?? null) : null,
    asignatura: input.subjectName,
    grupo: input.groupName,
    periodo: input.groupPeriod,
    profesor: input.teacherName?.trim() || null,
    fechaLimite: input.evaluation.due_date,
    filas,
    // Con un filtro activo la lista muestra los no entregados que lo cumplen, sin importar includeNotDelivered.
    noEntregaron: filtered || options.includeNotDelivered ? notDelivered : [],
    estadisticas,
  };
}

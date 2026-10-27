import type { Evaluation, Student, Submission } from "../db/types";
import { FILTERS, matchesFilter, type FilterKey } from "../lib/submissionFilter";

export type SortBy = "alfabetico" | "nota";

// "notas" lista calificaciones; "estado" lista estudiantes con su estado de entrega.
export type ReportVariant = "notas" | "estado";

// Estado de entrega de un estudiante. Sin entrega registrada cuenta como "pendiente".
export type ReportStatus = "entregado" | "tardia" | "pendiente" | "no_entrego";

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
  estado: ReportStatus;
  // Nota solo para entregas; null si no aplica (sin entregar o sin calificar).
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
  variante: ReportVariant;
  filas: ReportRow[];
  // Solo variante "notas": estudiantes con entrega pendiente (incluye los sin entrega registrada).
  pendientes: string[];
  // Solo variante "notas": estudiantes que no entregaron.
  noEntregaron: string[];
  estadisticas: ReportStats;
}

const collator = new Intl.Collator("es");

const DELIVERED_STATUSES: ReadonlySet<string> = new Set(["entregado", "tardia"]);

// Filtros que describen el estado de entrega: con ellos la variante es "estado".
// Filtros que usan la variante "estado" (sin notas).
export const ESTADO_FILTERS: ReadonlySet<FilterKey> = new Set(["pendientes", "no_entrego", "sin_calificar"]);

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
  const variante: ReportVariant = ESTADO_FILTERS.has(options.filter) ? "estado" : "notas";

  const rows: ReportRow[] = [];
  const pendientes: string[] = [];
  const noEntregaron: string[] = [];
  let total = 0;

  // Los estudiantes llegan ordenados por apellidos y nombres, y el sort es estable: el orden se conserva.
  for (const student of [...input.students].sort(compareStudents)) {
    const nombre = fullName(student);
    const submission = submissionByStudent.get(student.id);
    const estado: ReportStatus = submission ? submission.status : "pendiente";
    const entregado = DELIVERED_STATUSES.has(estado);
    const arrastre = carrierIds.has(student.id);
    // Sin entrega registrada cuenta como pendiente, y solo cumple el filtro "pendientes".
    const cumple = submission ? matchesFilter(submission, options.filter) : options.filter === "pendientes";
    if (filtered && !cumple) continue;
    total++;
    if (variante === "estado" || entregado) {
      rows.push({
        n: 0,
        nombre,
        estado,
        nota: entregado ? (submission?.grade ?? null) : null,
        notaMax: input.gradeMax,
        comentario: options.includeComments ? (submission?.comment ?? "").trim() : "",
        tardia: estado === "tardia",
        arrastre,
      });
    } else {
      const texto = arrastre ? `${nombre} (arrastre)` : nombre;
      if (estado !== "no_entrego") pendientes.push(texto);
      else if (options.includeNotDelivered) noEntregaron.push(texto);
    }
  }

  // Solo la variante "notas" ordena por calificacion; "estado" queda alfabetico.
  if (variante === "notas" && options.sortBy === "nota") {
    rows.sort((a, b) => {
      if (a.nota !== b.nota) {
        if (a.nota === null) return 1;
        if (b.nota === null) return -1;
        return b.nota - a.nota;
      }
      return 0;
    });
  }
  const filas = rows.map((row, i) => ({ ...row, n: i + 1 }));

  // En la variante "estado" no hay estadisticas de notas.
  const grades = variante === "notas" ? filas.flatMap((row) => (row.nota === null ? [] : [row.nota])) : [];
  const estadisticas: ReportStats = {
    promedio: grades.length === 0 ? null : grades.reduce((sum, g) => sum + g, 0) / grades.length,
    maxima: grades.length === 0 ? null : Math.max(...grades),
    minima: grades.length === 0 ? null : Math.min(...grades),
    entregaron: variante === "notas" ? filas.length : 0,
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
    variante,
    filas,
    pendientes,
    noEntregaron,
    estadisticas,
  };
}

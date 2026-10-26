import type { Submission } from "../db/types";
import { isDelivered } from "./submissionStatus";

export type FilterKey = "todos" | "pendientes" | "entregados" | "tardias" | "no_entrego" | "sin_calificar";

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "entregados", label: "Entregados" },
  { key: "tardias", label: "Tardias" },
  { key: "no_entrego", label: "No entregaron" },
  { key: "sin_calificar", label: "Sin calificar" },
];

export function matchesFilter(submission: Submission, filter: FilterKey): boolean {
  switch (filter) {
    case "todos":
      return true;
    case "pendientes":
      return submission.status === "pendiente";
    case "entregados":
      return submission.status === "entregado";
    case "tardias":
      return submission.status === "tardia";
    case "no_entrego":
      return submission.status === "no_entrego";
    case "sin_calificar":
      return isDelivered(submission) && submission.grade === null;
  }
}

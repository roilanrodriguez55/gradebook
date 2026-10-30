import type { Group, Modality } from "../db/types";

export const MODALITIES: { value: Modality; label: string }[] = [
  { value: "CRD", label: "CRD (curso regular diurno)" },
  { value: "CPE", label: "CPE (curso por encuentros)" },
];

const ORDINALS = ["", "1ro", "2do", "3ro", "4to", "5to"];

export function maxGrade(modality: Modality): number {
  return modality === "CRD" ? 4 : 5;
}

export function gradeLabel(grade: number): string {
  return ORDINALS[grade] ?? `${grade}.o`;
}

export function groupName(grade: number, modality: Modality): string {
  return `${gradeLabel(grade)} ${modality}`;
}

// Grado destino al promover (+1) o retroceder (-1); null si queda fuera de rango.
export function targetGrade(group: Pick<Group, "grade" | "modality">, delta: 1 | -1): number | null {
  if (group.grade === null || group.modality === null) return null;
  const next = group.grade + delta;
  return next >= 1 && next <= maxGrade(group.modality) ? next : null;
}

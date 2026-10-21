// Escala de notas: validacion y redondeo compartidos por la capa de datos y la UI.
// Las notas se redondean a 2 decimales (4.555 pasa a 4.56) y despues se comprueba el rango.

export interface GradeCheck {
  ok: boolean;
  value: number;
}

export function roundGrade(value: number): number {
  // toPrecision evita que 4.555 * 100 (= 455.49999...) redondee hacia abajo.
  return Math.round(Number((value * 100).toPrecision(15))) / 100;
}

export function validateGrade(grade: number, min: number, max: number): GradeCheck {
  if (!Number.isFinite(grade)) return { ok: false, value: NaN };
  const value = roundGrade(grade);
  return { ok: value >= min && value <= max, value };
}

// Devuelve el motivo si la escala no es valida, o null si lo es.
export function scaleError(min: number, max: number): string | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "Minimo y maximo deben ser numeros";
  if (min >= max) return "El minimo debe ser menor que el maximo";
  return null;
}

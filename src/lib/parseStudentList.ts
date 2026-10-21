export interface StudentName {
  lastNames: string;
  firstNames: string;
}

export interface ParsedStudentList {
  valid: StudentName[];
  invalid: string[];
}

// Formato por linea: "Nombres, Apellidos". Las lineas vacias se ignoran.
export function parseStudentList(text: string): ParsedStudentList {
  const result: ParsedStudentList = { valid: [], invalid: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const comma = line.indexOf(",");
    if (comma === -1) {
      result.invalid.push(line);
      continue;
    }
    const firstNames = line.slice(0, comma).trim();
    const lastNames = line.slice(comma + 1).trim();
    if (firstNames === "" || lastNames === "") {
      result.invalid.push(line);
    } else {
      result.valid.push({ lastNames, firstNames });
    }
  }
  return result;
}

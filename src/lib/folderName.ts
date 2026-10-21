const MAX_COMPONENT_LENGTH = 100;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/;

function trimTrailingDotsAndSpaces(s: string): string {
  return s.replace(/[. ]+$/, "");
}

// Quita acentos, caracteres invalidos y espacios sobrantes.
function cleanPart(s: string): string {
  return trimTrailingDotsAndSpaces(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

// Recorta a 100 caracteres y evita nombres reservados de Windows.
function finishName(s: string): string {
  const truncated = trimTrailingDotsAndSpaces(Array.from(s).slice(0, MAX_COMPONENT_LENGTH).join(""));
  // Windows no permite estos nombres, con o sin extension (CON.txt tambien).
  const stem = truncated.split(".")[0].toUpperCase();
  return WINDOWS_RESERVED.test(stem) ? `${truncated}_` : truncated;
}

export function sanitizeFolderName(s: string): string {
  return finishName(cleanPart(s));
}

// Carpeta del estudiante: <nombres>_<apellidos>. Sin nombres, solo los apellidos.
export function studentFolderName(firstNames: string, lastNames: string): string {
  const first = cleanPart(firstNames);
  const last = cleanPart(lastNames);
  if (first === "" && last === "") return "Sin_nombre";
  if (last === "") return finishName(first);
  if (first === "") return finishName(last);
  return finishName(`${first}_${last}`);
}

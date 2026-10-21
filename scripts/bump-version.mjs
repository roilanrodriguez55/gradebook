// Sube la version en todos los archivos que la declaran y anota el CHANGELOG.
// Uso: node scripts/bump-version.mjs <patch|minor|major> [--added "..."] [--changed "..."] [--fixed "..."]
// Las banderas se pueden repetir. Sin cambios: --dry-run solo muestra la version nueva.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = (p) => join(root, p);

const args = process.argv.slice(2);
const kind = args.shift();
if (!["patch", "minor", "major"].includes(kind)) {
  console.error("Uso: node scripts/bump-version.mjs <patch|minor|major> [--added ...] [--changed ...] [--fixed ...] [--dry-run]");
  process.exit(1);
}

const notes = { Added: [], Changed: [], Fixed: [] };
const flags = { "--added": "Added", "--changed": "Changed", "--fixed": "Fixed" };
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dry-run") dryRun = true;
  else if (flags[args[i]] && args[i + 1] !== undefined) notes[flags[args[i]]].push(args[++i]);
  else {
    console.error(`Argumento desconocido: ${args[i]}`);
    process.exit(1);
  }
}

const read = (p) => readFileSync(path(p), "utf8");

// Cada entrada: archivo, regex de la linea de version y cuantas ocurrencias se reemplazan (las primeras).
const targets = [
  { file: "package.json", re: /("version": ")(\d+\.\d+\.\d+)(")/, count: 1 },
  { file: "package-lock.json", re: /("version": ")(\d+\.\d+\.\d+)(")/, count: 2 },
  { file: "src-tauri/tauri.conf.json", re: /("version": ")(\d+\.\d+\.\d+)(")/, count: 1 },
  { file: "src-tauri/Cargo.toml", re: /^(version = ")(\d+\.\d+\.\d+)(")/m, count: 1 },
  { file: "src-tauri/Cargo.lock", re: /(name = "gradebook"\nversion = ")(\d+\.\d+\.\d+)(")/, count: 1 },
];

const current = /"version": "(\d+\.\d+\.\d+)"/.exec(read("package.json"))[1];
for (const t of targets) {
  const found = [...read(t.file).matchAll(new RegExp(t.re.source, t.re.flags.includes("m") ? "gm" : "g"))];
  if (found.length < t.count || found.slice(0, t.count).some((m) => m[2] !== current)) {
    console.error(`Versiones desincronizadas en ${t.file} (esperaba ${current}). Corrigelas a mano antes de subir.`);
    process.exit(1);
  }
}

const [maj, min, pat] = current.split(".").map(Number);
const next = kind === "major" ? `${maj + 1}.0.0` : kind === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
console.log(`${current} -> ${next}`);
if (dryRun) process.exit(0);

for (const t of targets) {
  let left = t.count;
  const flags = t.re.flags.replace("g", "");
  const re = new RegExp(t.re.source, flags + "g");
  const out = read(t.file).replace(re, (m, a, _v, c) => (left-- > 0 ? `${a}${next}${c}` : m));
  writeFileSync(path(t.file), out);
}

const date = new Date().toISOString().slice(0, 10);
const sections = Object.entries(notes)
  .filter(([, items]) => items.length)
  .map(([name, items]) => `### ${name}\n${items.map((i) => `- ${i}`).join("\n")}\n`)
  .join("\n");
const entry = `## [${next}] - ${date}\n\n${sections || "- Sin notas.\n"}\n`;
const cl = read("CHANGELOG.md");
const marker = cl.indexOf("\n## [");
writeFileSync(path("CHANGELOG.md"), marker === -1 ? `${cl.trimEnd()}\n\n${entry}` : `${cl.slice(0, marker + 1)}${entry}${cl.slice(marker + 1)}`);
console.log("Actualizado: package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock, CHANGELOG.md");

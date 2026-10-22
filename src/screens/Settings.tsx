import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { dirname } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getDb } from "../db/client";
import * as settings from "../db/settings";
import { scaleError } from "../lib/grade";
import { checkGit, type GitInfo } from "../lib/git";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/useToast";

const DEFAULT_GRADE_MIN = "2";
const DEFAULT_GRADE_MAX = "5";
const SQLITE_FILTER = { name: "Base SQLite", extensions: ["db"] };

const sectionClass =
  "flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10";
const buttonClass =
  "rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10";
const inputClass =
  "rounded-md border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/10";

type Notice = { ok: boolean; text: string } | null;

type GitStatus =
  | { state: "checking" }
  | { state: "ok"; info: GitInfo }
  | { state: "error"; message: string };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchGitStatus(path: string): Promise<GitStatus> {
  try {
    return { state: "ok", info: await checkGit(path) };
  } catch (err) {
    return { state: "error", message: errorText(err) };
  }
}

async function dbFilePath(): Promise<string> {
  return invoke<string>("db_path");
}

function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function NoticeText({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={`text-sm ${notice.ok ? "opacity-70" : "text-red-600 dark:text-red-400"}`}>
      {notice.text}
    </p>
  );
}

export default function Settings() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [teacherName, setTeacherName] = useState("");
  const [teacherNotice, setTeacherNotice] = useState<Notice>(null);

  const [gitPath, setGitPath] = useState("");
  const [gitPathSaved, setGitPathSaved] = useState("");
  const [gitStatus, setGitStatus] = useState<GitStatus>({ state: "checking" });
  const [gitNotice, setGitNotice] = useState<Notice>(null);

  const [gradeMin, setGradeMin] = useState(DEFAULT_GRADE_MIN);
  const [gradeMax, setGradeMax] = useState(DEFAULT_GRADE_MAX);
  const [gradeNotice, setGradeNotice] = useState<Notice>(null);

  const toast = useToast();
  const [dbPath, setDbPath] = useState("");
  const [dataBusy, setDataBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [teacher, path, minValue, maxValue, dbFile] = await Promise.all([
          settings.get("teacher_name"),
          settings.get("git_path"),
          settings.get("default_grade_min"),
          settings.get("default_grade_max"),
          dbFilePath(),
        ]);
        if (cancelled) return;
        setTeacherName(teacher ?? "");
        setGitPath(path ?? "");
        setGitPathSaved(path ?? "");
        setGradeMin(minValue ?? DEFAULT_GRADE_MIN);
        setGradeMax(maxValue ?? DEFAULT_GRADE_MAX);
        setDbPath(dbFile);
        setLoaded(true);
        const status = await fetchGitStatus(path ?? "");
        if (!cancelled) setGitStatus(status);
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveTeacherName() {
    const value = teacherName.trim();
    try {
      await settings.set("teacher_name", value);
      setTeacherName(value);
      setTeacherNotice({ ok: true, text: "Guardado" });
    } catch (err) {
      setTeacherNotice({ ok: false, text: errorText(err) });
    }
  }

  async function saveGitPath() {
    const value = gitPath.trim();
    try {
      await settings.set("git_path", value);
      setGitPath(value);
      setGitPathSaved(value);
      setGitNotice({ ok: true, text: "Guardado" });
      setGitStatus({ state: "checking" });
      setGitStatus(await fetchGitStatus(value));
    } catch (err) {
      setGitNotice({ ok: false, text: errorText(err) });
    }
  }

  async function recheckGit() {
    setGitStatus({ state: "checking" });
    setGitStatus(await fetchGitStatus(gitPathSaved));
  }

  async function saveGradeScale() {
    const min = Number(gradeMin);
    const max = Number(gradeMax);
    const error = scaleError(min, max);
    if (error !== null) {
      setGradeNotice({ ok: false, text: error });
      return;
    }
    try {
      await settings.set("default_grade_min", String(min));
      await settings.set("default_grade_max", String(max));
      setGradeMin(String(min));
      setGradeMax(String(max));
      setGradeNotice({ ok: true, text: "Guardado" });
    } catch (err) {
      setGradeNotice({ ok: false, text: errorText(err) });
    }
  }

  async function openDataFolder() {
    try {
      await openPath(await dirname(dbPath));
    } catch (err) {
      toast.show(errorText(err));
    }
  }

  async function exportBackup() {
    setDataBusy(true);
    try {
      const dest = await save({
        defaultPath: `entregas-respaldo-${localDate()}.db`,
        filters: [SQLITE_FILTER],
      });
      if (!dest) return;
      await invoke("remove_file_if_exists", { path: dest });
      const db = await getDb();
      await db.execute(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
      toast.show(`Respaldo guardado en ${dest}`, undefined, { variant: "success" });
    } catch (err) {
      toast.show(errorText(err));
    } finally {
      setDataBusy(false);
    }
  }

  async function restoreBackup() {
    setDataBusy(true);
    try {
      const src = await open({ multiple: false, directory: false, filters: [SQLITE_FILTER] });
      if (typeof src !== "string") {
        setConfirmRestore(false);
        return;
      }
      await invoke("stage_restore", { src });
      toast.show("Respaldo preparado. Reiniciando la app...", undefined, { variant: "success" });
      await invoke("restart_app");
    } catch (err) {
      toast.show(errorText(err));
      setConfirmRestore(false);
    } finally {
      setDataBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="p-6 text-sm opacity-70">
        {loadError ? `No se pudieron cargar los ajustes: ${loadError}` : "Cargando ajustes..."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Ajustes</h1>

      <section className={sectionClass}>
        <h2 className="font-medium">Perfil</h2>
        <label className="flex flex-col gap-1 text-sm">
          Nombre del profesor
          <input
            className={inputClass}
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
          />
        </label>
        <div>
          <button type="button" className={buttonClass} onClick={saveTeacherName}>
            Guardar
          </button>
        </div>
        <NoticeText notice={teacherNotice} />
      </section>

      <section className={sectionClass}>
        <h2 className="font-medium">Git</h2>
        {gitStatus.state === "checking" && <p className="text-sm opacity-70">Comprobando git...</p>}
        {gitStatus.state === "ok" && (
          <div className="text-sm">
            <p>Instalado, version {gitStatus.info.version}</p>
            <p className="break-all font-mono opacity-70">{gitStatus.info.path}</p>
          </div>
        )}
        {gitStatus.state === "error" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-red-600 dark:text-red-400">{gitStatus.message}</p>
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Git no esta disponible. La descarga de repositorios estara bloqueada hasta que se
              instale git o se indique su ruta.
            </p>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Ruta personalizada de git (opcional)
          <input
            className={inputClass}
            value={gitPath}
            placeholder="Vacio para usar el PATH del sistema"
            onChange={(e) => setGitPath(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={saveGitPath}>
            Guardar ruta
          </button>
          <button type="button" className={buttonClass} onClick={recheckGit}>
            Comprobar de nuevo
          </button>
        </div>
        <NoticeText notice={gitNotice} />
      </section>

      <section className={sectionClass}>
        <h2 className="font-medium">Escala de nota por defecto</h2>
        <p className="text-sm opacity-70">
          Se usa al crear asignaturas nuevas. Cada asignatura puede cambiarla desde su grupo.
        </p>
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Minimo
            <input
              type="number"
              step="any"
              className={`${inputClass} w-24`}
              value={gradeMin}
              onChange={(e) => setGradeMin(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Maximo
            <input
              type="number"
              step="any"
              className={`${inputClass} w-24`}
              value={gradeMax}
              onChange={(e) => setGradeMax(e.target.value)}
            />
          </label>
        </div>
        <div>
          <button type="button" className={buttonClass} onClick={saveGradeScale}>
            Guardar
          </button>
        </div>
        <NoticeText notice={gradeNotice} />
      </section>

      <section className={sectionClass}>
        <h2 className="font-medium">Datos</h2>
        <div className="flex flex-col gap-1 text-sm">
          <span>Ruta de la base de datos</span>
          <p className="select-all break-all font-mono text-sm">{dbPath}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={openDataFolder} disabled={!dbPath}>
            Abrir carpeta
          </button>
          <button type="button" className={buttonClass} onClick={exportBackup} disabled={dataBusy}>
            Exportar respaldo
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setConfirmRestore(true)}
            disabled={dataBusy}
          >
            Restaurar respaldo
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmRestore}
        title="Restaurar respaldo"
        message="La restauracion reemplaza todos los datos actuales por los del respaldo. Se recomienda exportar un respaldo de los datos actuales antes de continuar. La app se reiniciara para aplicar el cambio."
        confirmLabel="Restaurar"
        danger
        busy={dataBusy}
        onConfirm={restoreBackup}
        onCancel={() => setConfirmRestore(false)}
      />
    </div>
  );
}

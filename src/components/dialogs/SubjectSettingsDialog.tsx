import { open } from "@tauri-apps/plugin-dialog";
import { useState, type FormEvent } from "react";
import * as groupSubjects from "../../db/groupSubjects";
import * as subjects from "../../db/subjects";
import type { Subject } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { scaleError } from "../../lib/grade";
import { errorMessage } from "../../lib/errorMessage";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";

interface SubjectSettingsDialogProps {
  subject: Subject;
  // Vinculo grupo-asignatura: la carpeta de descargas es propia de cada grupo.
  linkId: number;
  downloadFolder: string | null;
  groupName: string;
  onClose: () => void;
}

export function SubjectSettingsDialog({ subject, linkId, downloadFolder, groupName, onClose }: SubjectSettingsDialogProps) {
  const [min, setMin] = useState(String(subject.grade_min));
  const [max, setMax] = useState(String(subject.grade_max));
  const [folder, setFolder] = useState<string | null>(downloadFolder);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { refresh } = useDataVersion();

  const minValue = Number(min);
  const maxValue = Number(max);
  const validationError = scaleError(minValue, maxValue);
  const canSubmit = !busy && validationError === null;

  async function chooseFolder() {
    setSaveError(null);
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Elegir carpeta de descargas del grupo",
      });
      if (typeof picked === "string") setFolder(picked);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }

  // Escala primero: si falla (nota fuera de rango), no se guarda nada, ni la carpeta.
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (minValue !== subject.grade_min || maxValue !== subject.grade_max) {
        await subjects.updateScale(subject.id, minValue, maxValue);
      }
      if (folder !== downloadFolder) {
        await groupSubjects.setDownloadFolder(linkId, folder);
      }
      refresh();
      onClose();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title={`Configuracion de ${subject.name}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">Escala de nota</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimo">
              <Input type="number" step="any" value={min} onChange={(e) => setMin(e.target.value)} autoFocus />
            </Field>
            <Field label="Maximo">
              <Input type="number" step="any" value={max} onChange={(e) => setMax(e.target.value)} />
            </Field>
          </div>
          <p className="-mt-1 text-xs text-muted">Se aplica a todas las evaluaciones de esta asignatura en todos los grupos.</p>
          {validationError !== null && min !== "" && max !== "" && <p className="text-sm text-danger">{validationError}</p>}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">Carpeta de descargas</h3>
          <p className={`select-all break-all font-mono text-sm ${folder === null ? "text-muted" : ""}`}>
            {folder ?? "Sin carpeta definida"}
          </p>
          <p className="-mt-1 text-xs text-muted">
            Aqui se crea una carpeta por tema con los repositorios de los estudiantes y el PDF de notas. Solo se usa
            para {subject.name} en el grupo {groupName}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void chooseFolder()} disabled={busy}>
              Elegir carpeta
            </Button>
            <Button variant="ghost" onClick={() => setFolder(null)} disabled={busy || folder === null}>
              Quitar
            </Button>
          </div>
        </section>

        {saveError !== null && <p className="text-sm text-danger">{saveError}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

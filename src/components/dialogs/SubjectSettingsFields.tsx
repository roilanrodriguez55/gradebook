import { open } from "@tauri-apps/plugin-dialog";
import type { Subject } from "../../db/types";
import { scaleError } from "../../lib/grade";
import { errorMessage } from "../../lib/errorMessage";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useToast } from "../ui/useToast";

export interface SubjectDraft {
  min: string;
  max: string;
  folder: string | null;
}

export function subjectScaleError(draft: SubjectDraft): string | null {
  if (draft.min === "" || draft.max === "") return "Escala incompleta";
  return scaleError(Number(draft.min), Number(draft.max));
}

interface SubjectSettingsFieldsProps {
  subject: Subject;
  groupName: string;
  draft: SubjectDraft;
  disabled: boolean;
  onChange: (draft: SubjectDraft) => void;
}

// Escala de nota y carpeta de descargas de una asignatura dentro del grupo. El guardado lo hace el dialogo del grupo.
export function SubjectSettingsFields({ subject, groupName, draft, disabled, onChange }: SubjectSettingsFieldsProps) {
  const toast = useToast();
  const error = subjectScaleError(draft);

  async function chooseFolder() {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Elegir carpeta de descargas del grupo",
      });
      if (typeof picked === "string") onChange({ ...draft, folder: picked });
    } catch (err) {
      toast.show(errorMessage(err));
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line p-3">
      <h4 className="font-semibold">{subject.name}</h4>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Minimo">
          <Input
            type="number"
            step="any"
            value={draft.min}
            onChange={(e) => onChange({ ...draft, min: e.target.value })}
          />
        </Field>
        <Field label="Maximo">
          <Input
            type="number"
            step="any"
            value={draft.max}
            onChange={(e) => onChange({ ...draft, max: e.target.value })}
          />
        </Field>
      </div>
      <p className="-mt-1 text-xs text-muted">Escala de nota: se aplica a todas las evaluaciones de la asignatura en todos los grupos.</p>
      {error !== null && draft.min !== "" && draft.max !== "" && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Carpeta de descargas</span>
        <p className={`select-all break-all font-mono text-sm ${draft.folder === null ? "text-muted" : ""}`}>
          {draft.folder ?? "Sin carpeta definida"}
        </p>
        <p className="text-xs text-muted">
          Aqui se crea una carpeta por tema con los repositorios de los estudiantes y el PDF de notas. Solo se usa para{" "}
          {subject.name} en el grupo {groupName}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void chooseFolder()} disabled={disabled}>
            Elegir carpeta
          </Button>
          <Button variant="ghost" onClick={() => onChange({ ...draft, folder: null })} disabled={disabled || draft.folder === null}>
            Quitar
          </Button>
        </div>
      </div>
    </section>
  );
}

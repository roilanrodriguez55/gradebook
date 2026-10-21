import { useMemo, useState, type FormEvent } from "react";
import * as students from "../../db/students";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { parseStudentList } from "../../lib/parseStudentList";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/useToast";

interface PasteStudentsDialogProps {
  groupId: number;
  onClose: () => void;
}

export function PasteStudentsDialog({ groupId, onClose }: PasteStudentsDialogProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const parsed = useMemo(() => parseStudentList(text), [text]);
  const canSubmit = !busy && parsed.valid.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await students.createMany(groupId, parsed.valid);
      refresh();
      onClose();
    } catch (err) {
      // createMany no es transaccional: si fallo a mitad, algunos estudiantes ya quedaron guardados.
      refresh();
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title="Pegar lista de estudiantes" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Una persona por linea, formato: Nombres, Apellidos">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            autoFocus
            placeholder={"Ana, Garcia Lopez\nJuan Carlos, Perez"}
            className="font-mono text-[13px]"
          />
        </Field>
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-ink">
            Estudiantes detectados: <span className="font-semibold">{parsed.valid.length}</span>
          </p>
          <p className={parsed.invalid.length > 0 ? "text-danger" : "text-muted"}>
            Lineas invalidas: {parsed.invalid.length}
          </p>
          {parsed.invalid.length > 0 && (
            <ul className="max-h-24 overflow-y-auto font-mono text-xs text-muted">
              {parsed.invalid.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            Importar {parsed.valid.length > 0 ? parsed.valid.length : ""}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState, type FormEvent } from "react";
import * as groupSubjects from "../../db/groupSubjects";
import * as subjects from "../../db/subjects";
import type { Subject } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { useLoad } from "../../lib/useLoad";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "../ui/useToast";

const NEW_SUBJECT = "__new__";

interface AddSubjectDialogProps {
  groupId: number;
  linkedSubjectIds: number[];
  onClose: () => void;
}

export function AddSubjectDialog({ groupId, linkedSubjectIds, onClose }: AddSubjectDialogProps) {
  const allSubjects = useLoad(() => subjects.list(), []);
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const available: Subject[] = (allSubjects ?? []).filter((s) => !linkedSubjectIds.includes(s.id));
  const selected = choice ?? (available[0] ? String(available[0].id) : NEW_SUBJECT);
  const trimmedNew = newName.trim();
  const canSubmit = !busy && (selected !== NEW_SUBJECT || trimmedNew.length > 0);

  async function resolveSubjectId(): Promise<number> {
    if (selected !== NEW_SUBJECT) return Number(selected);
    // subjects.name es UNIQUE: si ya existe con otra capitalizacion, se reutiliza.
    const existing = (allSubjects ?? []).find(
      (s) => s.name.toLocaleLowerCase() === trimmedNew.toLocaleLowerCase(),
    );
    if (existing) return existing.id;
    return (await subjects.create({ name: trimmedNew })).id;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const subjectId = await resolveSubjectId();
      if (linkedSubjectIds.includes(subjectId)) {
        throw new Error("Esa asignatura ya esta en el grupo");
      }
      await groupSubjects.create({ groupId, subjectId });
      refresh();
      onClose();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title="Agregar asignatura" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Asignatura">
          <Select value={selected} onChange={(e) => setChoice(e.target.value)}>
            {available.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
            <option value={NEW_SUBJECT}>Nueva asignatura...</option>
          </Select>
        </Field>
        {selected === NEW_SUBJECT && (
          <Field label="Nombre de la asignatura">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            Agregar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

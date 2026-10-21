import { useState, type FormEvent } from "react";
import * as students from "../../db/students";
import type { Student } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useToast } from "../ui/useToast";

interface StudentFormDialogProps {
  groupId: number;
  student?: Student;
  onClose: () => void;
}

export function StudentFormDialog({ groupId, student, onClose }: StudentFormDialogProps) {
  const [lastNames, setLastNames] = useState(student?.last_names ?? "");
  const [firstNames, setFirstNames] = useState(student?.first_names ?? "");
  const [githubUser, setGithubUser] = useState(student?.github_user ?? "");
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const canSubmit = !busy && lastNames.trim() !== "" && firstNames.trim() !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const input = {
      last_names: lastNames.trim(),
      first_names: firstNames.trim(),
      github_user: githubUser.trim() || null,
    };
    try {
      if (student) {
        await students.update(student.id, input);
      } else {
        await students.create(groupId, input);
      }
      refresh();
      onClose();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title={student ? "Editar estudiante" : "Nuevo estudiante"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombres">
          <Input value={firstNames} onChange={(e) => setFirstNames(e.target.value)} autoFocus maxLength={120} />
        </Field>
        <Field label="Apellidos">
          <Input value={lastNames} onChange={(e) => setLastNames(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Usuario GitHub (opcional)">
          <Input value={githubUser} onChange={(e) => setGithubUser(e.target.value)} maxLength={80} />
        </Field>
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

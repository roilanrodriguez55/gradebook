import { useEffect, useState, type FormEvent } from "react";
import * as students from "../../db/students";
import type { CarryOption, Student } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { useLoadState } from "../../lib/useLoad";
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

interface CarryData {
  options: CarryOption[];
  current: number[];
}

function carryLabel(option: CarryOption): string {
  return `${option.subject_name} - ${option.group_name}${option.course_name ? ` (${option.course_name})` : ""}`;
}

export function StudentFormDialog({ groupId, student, onClose }: StudentFormDialogProps) {
  const [lastNames, setLastNames] = useState(student?.last_names ?? "");
  const [firstNames, setFirstNames] = useState(student?.first_names ?? "");
  const [githubUser, setGithubUser] = useState(student?.github_user ?? "");
  const { data: carryData, loading: carryLoading, error: carryError } = useLoadState<CarryData>(async () => {
    const options = await students.listCarryOptions(groupId);
    const current = student ? (await students.listCarries(student.id)).map((c) => c.group_subject_id) : [];
    return { options, current };
  }, [groupId, student?.id]);
  const [carryIds, setCarryIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  useEffect(() => {
    if (carryData) setCarryIds(carryData.current);
  }, [carryData]);

  useEffect(() => {
    if (carryError !== null) toast.show(carryError);
  }, [carryError]);

  const canSubmit = !busy && lastNames.trim() !== "" && firstNames.trim() !== "";

  function toggleCarry(groupSubjectId: number) {
    setCarryIds((ids) =>
      ids.includes(groupSubjectId) ? ids.filter((id) => id !== groupSubjectId) : [...ids, groupSubjectId],
    );
  }

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
      let studentId: number;
      if (student) {
        await students.update(student.id, input);
        studentId = student.id;
      } else {
        studentId = (await students.create(groupId, input)).id;
      }
      // Solo guarda arrastres cargados: si aun cargan, guardar vaciaria los existentes.
      if (carryData) await students.setCarries(studentId, carryIds);
      onClose();
      refresh();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Se monta cuando ya cargo la seccion de arrastre: si aparece despues, el dialogo cambia de altura.
  // Solo la primera carga oculta el dialogo; recargas posteriores no lo desmontan.
  if (carryLoading && !carryData) return null;

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
        {carryData && carryData.options.length > 0 && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="font-medium text-ink">Arrastre (asignaturas de otros grupos)</legend>
            {carryData.options.map((option) => (
              <label key={option.group_subject_id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={carryIds.includes(option.group_subject_id)}
                  onChange={() => toggleCarry(option.group_subject_id)}
                />
                {carryLabel(option)}
              </label>
            ))}
          </fieldset>
        )}
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

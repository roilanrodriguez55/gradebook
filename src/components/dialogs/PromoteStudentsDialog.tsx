import { useState, type FormEvent } from "react";
import * as courses from "../../db/courses";
import * as groups from "../../db/groups";
import * as students from "../../db/students";
import type { Group } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { useLoad } from "../../lib/useLoad";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "../ui/useToast";

const NEW_GROUP = "nuevo";

interface PromoteStudentsDialogProps {
  fromGroup: Group;
  studentIds: number[];
  onClose: () => void;
}

export function PromoteStudentsDialog({ fromGroup, studentIds, onClose }: PromoteStudentsDialogProps) {
  const allGroups = useLoad(() => groups.list(), []);
  const allCourses = useLoad(() => courses.list(), []);
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");
  const [newCourseId, setNewCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const isNew = target === NEW_GROUP;
  const trimmedNewName = newName.trim();
  const targetGroups = (allGroups ?? []).filter((g) => g.id !== fromGroup.id);
  const courseIds = new Set((allCourses ?? []).map((c) => c.id));
  const sections = [
    ...(allCourses ?? []).map((c) => ({
      key: String(c.id),
      label: c.name,
      items: targetGroups.filter((g) => g.course_id === c.id),
    })),
    {
      key: "sin-curso",
      label: "Sin curso",
      items: targetGroups.filter((g) => g.course_id === null || !courseIds.has(g.course_id)),
    },
  ].filter((s) => s.items.length > 0);

  const canSubmit = !busy && (isNew ? trimmedNewName !== "" : target !== "");
  const count = studentIds.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const toGroup = isNew
        ? await groups.create({
            name: trimmedNewName,
            course_id: newCourseId === "" ? null : Number(newCourseId),
          })
        : targetGroups.find((g) => g.id === Number(target)) ?? null;
      if (!toGroup) throw new Error("Grupo destino no encontrado");
      await students.promote(studentIds, fromGroup.id, toGroup.id);
      toast.show(
        `${count} ${count === 1 ? "estudiante promovido" : "estudiantes promovidos"} a ${toGroup.name}`,
        undefined,
        { variant: "success" },
      );
      onClose();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <Dialog open title="Promover estudiantes" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {count === 1 ? "1 estudiante pasara" : `${count} estudiantes pasaran`} de {fromGroup.name} al grupo
          destino. Sus entregas en {fromGroup.name} se conservan.
        </p>
        <Field label="Grupo destino">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Elegir grupo</option>
            {sections.map((section) => (
              <optgroup key={section.key} label={section.label}>
                {section.items.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={NEW_GROUP}>Crear grupo nuevo</option>
          </Select>
        </Field>
        {isNew && (
          <>
            <Field label="Nombre del grupo">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus maxLength={120} />
            </Field>
            <Field label="Curso">
              <Select value={newCourseId} onChange={(e) => setNewCourseId(e.target.value)}>
                <option value="">Sin curso</option>
                {(allCourses ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <p className="text-sm text-muted">Las asignaturas del grupo destino se agregaran despues.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            Promover
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState, type FormEvent } from "react";
import * as courses from "../../db/courses";
import * as groups from "../../db/groups";
import * as students from "../../db/students";
import type { Course, Group } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { groupName, targetGrade } from "../../lib/grades";
import { useLoad } from "../../lib/useLoad";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "../ui/useToast";

const NEW_COURSE = "nuevo";

interface PromoteStudentsDialogProps {
  fromGroup: Group;
  studentIds: number[];
  direction: "up" | "down";
  onClose: () => void;
}

// Curso siguiente (promover) o anterior (retroceder) por orden de creacion; si no hay, el mismo.
function defaultCourseId(all: Course[], fromCourseId: number | null, direction: "up" | "down"): number | null {
  const sorted = [...all].sort((a, b) => a.id - b.id);
  const index = sorted.findIndex((c) => c.id === fromCourseId);
  if (index === -1) return null;
  const neighbor = direction === "up" ? sorted[index + 1] : sorted[index - 1];
  return (neighbor ?? sorted[index]).id;
}

export function PromoteStudentsDialog({ fromGroup, studentIds, direction, onClose }: PromoteStudentsDialogProps) {
  const allCourses = useLoad(() => courses.list(), []);
  const [courseChoice, setCourseChoice] = useState<string | null>(null);
  const [newCourseName, setNewCourseName] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const grade = targetGrade(fromGroup, direction === "up" ? 1 : -1);
  const modality = fromGroup.modality;
  const toName = grade === null || modality === null ? null : groupName(grade, modality);
  const defaultId = defaultCourseId(allCourses ?? [], fromGroup.course_id, direction);
  const selectedCourse = courseChoice ?? (defaultId === null ? "" : String(defaultId));
  const trimmedNewName = newCourseName.trim();
  const count = studentIds.length;

  const blockedMessage =
    fromGroup.grade === null || modality === null
      ? "Este grupo no tiene grado y modalidad, editalo primero"
      : toName !== null
        ? null
        : direction === "up"
          ? `Ya esta en el ultimo grado de ${modality}`
          : "Ya esta en 1er grado";

  const canSubmit = !busy && toName !== null && (selectedCourse !== NEW_COURSE || trimmedNewName !== "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || grade === null || modality === null) return;
    setBusy(true);
    try {
      const courseId =
        selectedCourse === NEW_COURSE
          ? (await courses.create({ name: trimmedNewName })).id
          : selectedCourse === ""
            ? null
            : Number(selectedCourse);
      const toGroup = await groups.findOrCreate({ grade, modality, course_id: courseId, semester: fromGroup.semester });
      await students.promote(studentIds, fromGroup.id, toGroup.id);
      const estudiantes = count === 1 ? "estudiante" : "estudiantes";
      const verbo =
        direction === "up"
          ? count === 1
            ? "promovido"
            : "promovidos"
          : count === 1
            ? "retrocedido"
            : "retrocedidos";
      toast.show(`${count} ${estudiantes} ${verbo} a ${toGroup.name}`, undefined, { variant: "success" });
      onClose();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <Dialog open title={direction === "up" ? "Promover estudiantes" : "Retroceder estudiantes"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {blockedMessage !== null ? (
          <p className="text-sm text-danger">{blockedMessage}</p>
        ) : (
          <p className="text-sm text-muted">
            {count === 1 ? "1 estudiante pasara" : `${count} estudiantes pasaran`} de {fromGroup.name} a {toName}.
            Sus entregas en {fromGroup.name} se conservan.
          </p>
        )}
        <Field label="Curso destino">
          <Select value={selectedCourse} onChange={(e) => setCourseChoice(e.target.value)}>
            <option value="">Sin curso</option>
            {(allCourses ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
            <option value={NEW_COURSE}>Crear curso nuevo</option>
          </Select>
        </Field>
        {selectedCourse === NEW_COURSE && (
          <Field label="Nombre del curso">
            <Input value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} autoFocus maxLength={120} />
          </Field>
        )}
        <p className="text-sm text-muted">Las asignaturas del grupo destino se agregaran despues.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {direction === "up" ? "Promover" : "Retroceder"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

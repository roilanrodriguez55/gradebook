import { useState, type FormEvent } from "react";
import * as courses from "../../db/courses";
import * as groups from "../../db/groups";
import * as groupSubjects from "../../db/groupSubjects";
import * as subjects from "../../db/subjects";
import type { Group, Modality, Subject } from "../../db/types";
import { groupName, gradeLabel, MODALITIES, maxGrade } from "../../lib/grades";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { useLoad } from "../../lib/useLoad";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { useToast } from "../ui/useToast";
import { SubjectSettingsFields, subjectScaleError, type SubjectDraft } from "./SubjectSettingsFields";

// Asignatura vinculada al grupo que se edita (solo al editar).
export interface GroupSubjectChip {
  linkId: number;
  subject: Subject;
  downloadFolder: string | null;
}

interface GroupFormDialogProps {
  group?: Group;
  subjects?: GroupSubjectChip[];
  onClose: () => void;
  onCreated?: (group: Group) => void;
}

const SEMESTERS: { value: 1 | 2; label: string }[] = [
  { value: 1, label: "1er semestre" },
  { value: 2, label: "2do semestre" },
];

export function GroupFormDialog({ group, subjects: chips = [], onClose, onCreated }: GroupFormDialogProps) {
  const [courseId, setCourseId] = useState(typeof group?.course_id === "number" ? String(group.course_id) : "");
  const [grade, setGrade] = useState(group?.grade ?? 1);
  // Un grupo legacy sin modalidad obliga a elegirla; null mantiene el envio deshabilitado.
  const [modality, setModality] = useState<Modality | null>(group ? group.modality : "CRD");
  const [semester, setSemester] = useState<1 | 2>(group?.semester ?? 1);
  const [drafts, setDrafts] = useState<Record<number, SubjectDraft>>(() =>
    Object.fromEntries(
      chips.map((c) => [
        c.linkId,
        { min: String(c.subject.grade_min), max: String(c.subject.grade_max), folder: c.downloadFolder },
      ]),
    ),
  );
  const allCourses = useLoad(() => courses.list(), []);
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const modalityLocked = group !== undefined && group.modality !== null;
  const scalesValid = chips.every((c) => drafts[c.linkId] && subjectScaleError(drafts[c.linkId]) === null);
  const valid = modality !== null && grade >= 1 && grade <= maxGrade(modality) && scalesValid;

  function changeModality(next: Modality) {
    setModality(next);
    setGrade((g) => Math.min(g, maxGrade(next)));
  }

  // Escala primero: si falla (nota fuera de rango) no se guarda nada mas de esa asignatura.
  async function saveSubjects() {
    for (const chip of chips) {
      const draft = drafts[chip.linkId];
      const min = Number(draft.min);
      const max = Number(draft.max);
      if (min !== chip.subject.grade_min || max !== chip.subject.grade_max) {
        await subjects.updateScale(chip.subject.id, min, max);
      }
      if (draft.folder !== chip.downloadFolder) {
        await groupSubjects.setDownloadFolder(chip.linkId, draft.folder);
      }
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || modality === null || busy) return;
    setBusy(true);
    try {
      const course_id = courseId === "" ? null : Number(courseId);
      if (group) {
        await groups.update(group.id, {
          grade,
          course_id,
          semester,
          ...(group.modality === null ? { modality } : {}),
        });
        await saveSubjects();
      } else {
        const created = await groups.create({ grade, modality, course_id, semester });
        onCreated?.(created);
      }
      refresh();
      onClose();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const previewName = modality ? groupName(grade, modality) : "elige una modalidad";

  return (
    <Dialog open title={group ? "Editar grupo" : "Nuevo grupo"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Curso">
          <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Sin curso</option>
            {(allCourses ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 font-medium text-ink">Semestre</legend>
          <div className="flex gap-4">
            {SEMESTERS.map((s) => (
              <label key={s.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="semestre"
                  value={s.value}
                  checked={semester === s.value}
                  onChange={() => setSemester(s.value)}
                  className="accent-accent"
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Modalidad">
          <Select
            value={modality ?? ""}
            disabled={modalityLocked}
            onChange={(e) => changeModality(e.target.value as Modality)}
          >
            {modality === null && <option value="">Elegir modalidad</option>}
            {MODALITIES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Grado">
          <Select
            value={String(grade)}
            disabled={modality === null}
            onChange={(e) => setGrade(Number(e.target.value))}
          >
            {Array.from({ length: modality ? maxGrade(modality) : 0 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>
                {gradeLabel(g)}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-muted">Nombre: {previewName}</p>

        {group && chips.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="font-semibold">Asignaturas</h3>
            <div className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto pr-1">
              {chips.map((c) => (
                <SubjectSettingsFields
                  key={c.linkId}
                  subject={c.subject}
                  groupName={previewName}
                  draft={drafts[c.linkId]}
                  disabled={busy}
                  onChange={(draft) => setDrafts((prev) => ({ ...prev, [c.linkId]: draft }))}
                />
              ))}
            </div>
          </section>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

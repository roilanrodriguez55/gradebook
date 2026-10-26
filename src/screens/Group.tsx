import { Archive, ArchiveRestore, FolderOpen, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as courses from "../db/courses";
import * as groupSubjects from "../db/groupSubjects";
import * as groups from "../db/groups";
import * as students from "../db/students";
import * as subjects from "../db/subjects";
import type { Course, Group, Student, StudentInGroup, Subject } from "../db/types";
import { useDataVersion } from "../context/DataVersionContext";
import { AddSubjectDialog } from "../components/dialogs/AddSubjectDialog";
import { EvaluationFormDialog } from "../components/dialogs/EvaluationFormDialog";
import { GroupFormDialog } from "../components/dialogs/GroupFormDialog";
import { PasteStudentsDialog } from "../components/dialogs/PasteStudentsDialog";
import { PromoteStudentsDialog } from "../components/dialogs/PromoteStudentsDialog";
import { SubjectSettingsDialog } from "../components/dialogs/SubjectSettingsDialog";
import { StudentFormDialog } from "../components/dialogs/StudentFormDialog";
import { StudentTable } from "../components/StudentTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { LoadError } from "../components/ui/LoadError";
import { errorMessage } from "../lib/errorMessage";
import { useLoadState } from "../lib/useLoad";
import { useToast } from "../components/ui/useToast";

interface SubjectChip {
  linkId: number;
  subject: Subject;
}

interface GroupPage {
  group: Group;
  course: Course | null;
  chips: SubjectChip[];
  students: StudentInGroup[];
  carryCounts: Map<number, number>;
  groupNames: Map<number, string>;
}

async function loadGroupPage(groupId: number): Promise<GroupPage | null> {
  const group = await groups.get(groupId);
  if (!group) return null;
  const [course, links, allSubjects, groupStudents, carryCounts, allGroups] = await Promise.all([
    group.course_id === null ? Promise.resolve(null) : courses.get(group.course_id),
    groupSubjects.listByGroup(groupId),
    subjects.list(),
    students.listByGroup(groupId),
    students.carryCountsByGroup(groupId),
    groups.list(true),
  ]);
  const byId = new Map(allSubjects.map((s) => [s.id, s]));
  const chips: SubjectChip[] = [];
  for (const link of links) {
    const subject = byId.get(link.subject_id);
    if (subject) chips.push({ linkId: link.id, subject });
  }
  const groupNames = new Map(allGroups.map((g) => [g.id, g.name]));
  return { group, course, chips, students: groupStudents, carryCounts, groupNames };
}

type StudentDialog = { mode: "new" } | { mode: "edit"; student: Student } | null;

export default function Group() {
  const { id } = useParams();
  const groupId = Number(id);
  const navigate = useNavigate();
  const { version, refresh } = useDataVersion();
  const toast = useToast();

  const pageState = useLoadState(
    () => (Number.isInteger(groupId) ? loadGroupPage(groupId) : Promise.resolve(null)),
    [groupId, version],
  );
  const page = pageState.data;

  const [editingGroup, setEditingGroup] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [configuringSubject, setConfiguringSubject] = useState<Subject | null>(null);
  const [creatingEvaluation, setCreatingEvaluation] = useState<SubjectChip | null>(null);
  const [unlinking, setUnlinking] = useState<SubjectChip | null>(null);
  const [studentDialog, setStudentDialog] = useState<StudentDialog>(null);
  const [pasting, setPasting] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [promotingIds, setPromotingIds] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (pageState.error !== null) return <LoadError message={pageState.error} onRetry={pageState.reload} />;
  if (page === undefined) return <p className="text-muted">Cargando...</p>;
  if (page === null) {
    return <p className="text-muted">Grupo no encontrado.</p>;
  }

  const { group, course, chips, students: groupStudents, carryCounts, groupNames } = page;
  const isArchived = group.archived === 1;

  // Ejecuta una mutacion: muestra el error en toast y siempre recarga los datos.
  async function mutate(action: () => Promise<void>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      after?.();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  function toggleArchive() {
    void mutate(() => groups.update(group.id, { archived: isArchived ? 0 : 1 }));
  }

  function deleteGroup() {
    void mutate(() => groups.remove(group.id), () => {
      setConfirmDeleteGroup(false);
      navigate("/");
    });
  }

  function unlinkSubject() {
    if (!unlinking) return;
    const linkId = unlinking.linkId;
    void mutate(() => groupSubjects.remove(linkId), () => setUnlinking(null));
  }

  function deleteStudent() {
    if (!deletingStudent) return;
    const studentId = deletingStudent.id;
    void mutate(() => students.removeFromGroup(studentId, groupId), () => setDeletingStudent(null));
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{group.name}</h1>
            {isArchived && <Badge>Archivado</Badge>}
          </div>
          <p className="text-muted">
            {group.period ?? "Sin periodo"}
            {course && ` · ${course.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditingGroup(true)} disabled={busy}>
            <Pencil size={14} />
            Editar
          </Button>
          <Button onClick={toggleArchive} disabled={busy}>
            {isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {isArchived ? "Desarchivar" : "Archivar"}
          </Button>
          <Button variant="ghost" className="text-danger" onClick={() => setConfirmDeleteGroup(true)} disabled={busy}>
            <Trash2 size={14} />
            Eliminar
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Asignaturas</h2>
          <Button onClick={() => setAddingSubject(true)} disabled={busy}>
            <Plus size={14} />
            Asignatura
          </Button>
        </div>
        {chips.length === 0 ? (
          <p className="text-muted">Este grupo todavia no tiene asignaturas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <div key={chip.linkId} className="flex items-center gap-1">
                <span className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1">
                  {chip.subject.name}
                  <span className="text-xs tabular-nums text-muted">
                    {chip.subject.grade_min}-{chip.subject.grade_max}
                  </span>
                  {chip.subject.download_folder && (
                    <span
                      role="img"
                      aria-label="Tiene carpeta de descargas"
                      title={chip.subject.download_folder}
                      className="flex text-muted"
                    >
                      <FolderOpen size={12} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setUnlinking(chip)}
                    aria-label={`Quitar ${chip.subject.name}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
                  >
                    <X size={12} />
                  </button>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setConfiguringSubject(chip.subject)}
                  disabled={busy}
                  aria-label={`Configuracion de ${chip.subject.name}`}
                  title="Configuracion"
                >
                  <Settings2 size={14} />
                </Button>
                <Button size="sm" onClick={() => setCreatingEvaluation(chip)} disabled={busy}>
                  + Evaluacion
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Estudiantes ({groupStudents.length})</h2>
        <StudentTable
          students={groupStudents}
          carryCounts={carryCounts}
          groupNames={groupNames}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          onAdd={() => setStudentDialog({ mode: "new" })}
          onPaste={() => setPasting(true)}
          onEdit={(student) => setStudentDialog({ mode: "edit", student })}
          onDelete={(student) => setDeletingStudent(student)}
          onPromote={(ids) => setPromotingIds(ids)}
        />
      </section>

      {editingGroup && <GroupFormDialog group={group} onClose={() => setEditingGroup(false)} />}

      <ConfirmDialog
        open={confirmDeleteGroup}
        title="Eliminar grupo"
        message={
          <>
            Se borraran el grupo, sus {groupStudents.length} estudiantes, sus asignaturas y todas sus evaluaciones y
            entregas. Esta accion no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar grupo"
        danger
        busy={busy}
        onConfirm={deleteGroup}
        onCancel={() => setConfirmDeleteGroup(false)}
      />

      {creatingEvaluation && (
        <EvaluationFormDialog
          groupSubjectId={creatingEvaluation.linkId}
          onClose={() => setCreatingEvaluation(null)}
          onCreated={(evaluation) => navigate(`/evaluacion/${evaluation.id}`)}
        />
      )}

      {configuringSubject && (
        <SubjectSettingsDialog subject={configuringSubject} onClose={() => setConfiguringSubject(null)} />
      )}

      {addingSubject && (
        <AddSubjectDialog
          groupId={group.id}
          linkedSubjectIds={chips.map((c) => c.subject.id)}
          onClose={() => setAddingSubject(false)}
        />
      )}

      <ConfirmDialog
        open={unlinking !== null}
        title="Quitar asignatura"
        message={
          <>
            Quitar {unlinking?.subject.name} del grupo borra sus evaluaciones y las entregas asociadas.
          </>
        }
        confirmLabel="Quitar"
        danger
        busy={busy}
        onConfirm={unlinkSubject}
        onCancel={() => setUnlinking(null)}
      />

      {studentDialog?.mode === "new" && (
        <StudentFormDialog groupId={group.id} onClose={() => setStudentDialog(null)} />
      )}
      {studentDialog?.mode === "edit" && (
        <StudentFormDialog
          groupId={group.id}
          student={studentDialog.student}
          onClose={() => setStudentDialog(null)}
        />
      )}

      {pasting && <PasteStudentsDialog groupId={group.id} onClose={() => setPasting(false)} />}

      {promotingIds !== null && (
        <PromoteStudentsDialog
          fromGroup={group}
          studentIds={promotingIds}
          onClose={() => setPromotingIds(null)}
        />
      )}

      <ConfirmDialog
        open={deletingStudent !== null}
        title="Quitar del grupo"
        message={
          <>
            Se quitara a {deletingStudent?.first_names} {deletingStudent?.last_names} de este grupo y se perderan sus
            entregas y notas aqui. Sus matriculas en otros grupos no cambian.
          </>
        }
        confirmLabel="Quitar del grupo"
        danger
        busy={busy}
        onConfirm={deleteStudent}
        onCancel={() => setDeletingStudent(null)}
      />
    </div>
  );
}

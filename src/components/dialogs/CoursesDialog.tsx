import { Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import * as courses from "../../db/courses";
import type { Course } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { useLoad } from "../../lib/useLoad";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { useToast } from "../ui/useToast";

interface CoursesDialogProps {
  onClose: () => void;
}

export function CoursesDialog({ onClose }: CoursesDialogProps) {
  const { version, refresh } = useDataVersion();
  const allCourses = useLoad(() => courses.list(), [version]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Course | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const trimmedNew = newName.trim();
  const trimmedEdit = editName.trim();

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!trimmedNew || busy) return;
    setBusy(true);
    try {
      await courses.create({ name: trimmedNew });
      setNewName("");
      refresh();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(course: Course) {
    setEditing(course);
    setEditName(course.name);
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!editing || !trimmedEdit || busy) return;
    if (trimmedEdit === editing.name) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      await courses.update(editing.id, { name: trimmedEdit });
      setEditing(null);
      refresh();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await courses.remove(deleting.id);
      setDeleting(null);
      refresh();
    } catch (err) {
      toast.show(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open title="Cursos" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <form onSubmit={create} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del curso"
              maxLength={120}
              aria-label="Nombre del curso"
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="primary" disabled={!trimmedNew || busy}>
              Agregar
            </Button>
          </form>

          {allCourses?.length === 0 && <p className="text-muted">Todavia no hay cursos.</p>}

          {allCourses && allCourses.length > 0 && (
            <ul className="flex flex-col">
              {allCourses.map((course) =>
                editing?.id === course.id ? (
                  <li key={course.id}>
                    <form onSubmit={rename} className="flex gap-2 py-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        maxLength={120}
                        aria-label="Nuevo nombre del curso"
                        className="min-w-0 flex-1"
                      />
                      <Button type="submit" variant="primary" disabled={!trimmedEdit || busy}>
                        Guardar
                      </Button>
                      <Button onClick={() => setEditing(null)} disabled={busy}>
                        Cancelar
                      </Button>
                    </form>
                  </li>
                ) : (
                  <li key={course.id} className="flex items-center justify-between gap-2 border-b border-line py-2">
                    <span className="min-w-0 truncate">{course.name}</span>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(course)} aria-label="Renombrar curso">
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(course)} aria-label="Eliminar curso">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar curso"
        message={
          <>
            Se elimina el curso "{deleting?.name}". Sus grupos no se eliminan: quedan en "Sin curso".
          </>
        }
        confirmLabel="Eliminar"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

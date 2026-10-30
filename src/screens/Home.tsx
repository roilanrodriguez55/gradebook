import { BookOpen, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDataVersion } from "../context/DataVersionContext";
import { loadGroupViews, type GroupView } from "../lib/queries";
import { useLoadState } from "../lib/useLoad";
import { CoursesDialog } from "../components/dialogs/CoursesDialog";
import { GroupFormDialog } from "../components/dialogs/GroupFormDialog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadError } from "../components/ui/LoadError";

interface CourseSection {
  key: string;
  name: string;
  views: GroupView[];
}

// Dentro de cada curso: por modalidad y luego por grado. Los grupos sin modalidad van al final.
function compareGroups(a: GroupView, b: GroupView): number {
  const ma = a.group.modality;
  const mb = b.group.modality;
  if (ma !== mb) {
    if (ma === null) return 1;
    if (mb === null) return -1;
    return ma < mb ? -1 : 1;
  }
  return (a.group.grade ?? 99) - (b.group.grade ?? 99);
}

// Cursos por nombre; los grupos sin curso van al final bajo "Sin curso".
function groupByCourse(views: GroupView[]): CourseSection[] {
  const byCourse = new Map<number, CourseSection>();
  for (const gv of views) {
    if (gv.course === null) continue;
    const section = byCourse.get(gv.course.id) ?? {
      key: `curso-${gv.course.id}`,
      name: gv.course.name,
      views: [],
    };
    section.views.push(gv);
    byCourse.set(gv.course.id, section);
  }
  const sections = [...byCourse.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const noCourse = views.filter((gv) => gv.course === null);
  if (noCourse.length > 0) sections.push({ key: "sin-curso", name: "Sin curso", views: noCourse });
  for (const section of sections) section.views.sort(compareGroups);
  return sections;
}

export default function Home() {
  const navigate = useNavigate();
  const { version } = useDataVersion();
  const viewsState = useLoadState(() => loadGroupViews(false), [version]);
  const views = viewsState.data;
  const [creating, setCreating] = useState(false);
  const [managingCourses, setManagingCourses] = useState(false);

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Grupos</h1>
        <div className="flex gap-2">
          <Button onClick={() => setManagingCourses(true)}>
            <BookOpen size={14} />
            Administrar cursos
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} />
            Nuevo grupo
          </Button>
        </div>
      </header>

      {viewsState.error !== null && <LoadError message={viewsState.error} onRetry={viewsState.reload} />}

      {views?.length === 0 && (
        <EmptyState
          icon={<Users size={32} />}
          title="Todavia no hay grupos"
          description="Crea un grupo, agrega sus asignaturas y pega la lista de estudiantes."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              Crear grupo
            </Button>
          }
        />
      )}

      {views &&
        views.length > 0 &&
        groupByCourse(views).map((section) => (
          <section key={section.key} className="mb-6 flex flex-col gap-3">
            <h2 className="font-semibold text-muted">{section.name}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {section.views.map((gv) => (
                <li key={gv.group.id}>
                  <Link
                    to={`/grupo/${gv.group.id}`}
                    className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 hover:bg-hover"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{gv.group.name}</p>
                        <p className="text-muted">
                          {gv.group.modality ?? "Sin modalidad"}, {gv.group.semester === 1 ? "1er" : "2do"} semestre
                        </p>
                      </div>
                      <span className="shrink-0 text-muted">
                        {gv.studentCount} {gv.studentCount === 1 ? "estudiante" : "estudiantes"}
                      </span>
                    </div>
                    {gv.subjects.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {gv.subjects.map((sv) => (
                          <Badge key={sv.id} tone="accent">
                            {sv.subject.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted">Sin asignaturas</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {creating && (
        <GroupFormDialog
          onClose={() => setCreating(false)}
          onCreated={(group) => navigate(`/grupo/${group.id}`)}
        />
      )}

      {managingCourses && <CoursesDialog onClose={() => setManagingCourses(false)} />}
    </>
  );
}

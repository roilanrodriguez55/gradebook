import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDataVersion } from "../context/DataVersionContext";
import { loadGroupViews } from "../lib/queries";
import { useLoadState } from "../lib/useLoad";
import { GroupFormDialog } from "../components/dialogs/GroupFormDialog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadError } from "../components/ui/LoadError";

export default function Home() {
  const navigate = useNavigate();
  const { version } = useDataVersion();
  const viewsState = useLoadState(() => loadGroupViews(false), [version]);
  const views = viewsState.data;
  const [creating, setCreating] = useState(false);

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Grupos</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} />
          Nuevo grupo
        </Button>
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

      {views && views.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {views.map((gv) => (
            <li key={gv.group.id}>
              <Link
                to={`/grupo/${gv.group.id}`}
                className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 hover:bg-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{gv.group.name}</p>
                    <p className="text-muted">{gv.group.period ?? "Sin periodo"}</p>
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
      )}

      {creating && (
        <GroupFormDialog
          onClose={() => setCreating(false)}
          onCreated={(group) => navigate(`/grupo/${group.id}`)}
        />
      )}
    </>
  );
}

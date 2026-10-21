import clsx from "clsx";
import { ChevronDown, ChevronRight, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useDataVersion } from "../context/DataVersionContext";
import { loadGroupViews } from "../lib/queries";
import { useLoadState } from "../lib/useLoad";
import { EvaluationFormDialog } from "./dialogs/EvaluationFormDialog";
import { GroupFormDialog } from "./dialogs/GroupFormDialog";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { LoadError } from "./ui/LoadError";

const COLLAPSED_KEY = "entregas.sidebar.collapsed";

function readCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(keys: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...keys]));
  } catch {
    // Sin almacenamiento disponible el arbol se abre de nuevo al recargar; no es critico.
  }
}

const rowBase = "flex min-h-8 items-center gap-1 rounded px-1 text-sm";
const linkBase = "flex-1 truncate rounded px-1.5 py-1 hover:bg-hover";

function ToggleButton({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-hover"
    >
      <Icon size={14} />
    </button>
  );
}

export default function Shell() {
  const navigate = useNavigate();
  const { version } = useDataVersion();
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingEvaluationFor, setCreatingEvaluationFor] = useState<number | null>(null);

  const viewsState = useLoadState(() => loadGroupViews(showArchived), [version, showArchived]);
  const views = viewsState.data;

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeCollapsed(next);
      return next;
    });
  }

  return (
    <div className="flex h-full">
      <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-12 shrink-0 items-center px-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <img src="/logo-mark.png" alt="" className="size-7 rounded-md" draggable={false} />
            Gradebook
          </NavLink>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Grupos y asignaturas">
          {viewsState.error !== null && <LoadError message={viewsState.error} onRetry={viewsState.reload} />}
          {views?.length === 0 && <p className="px-1.5 py-2 text-muted">Sin grupos todavia.</p>}
          {views?.map((gv) => {
            const groupKey = `group:${gv.group.id}`;
            const groupOpen = !collapsed.has(groupKey);
            return (
              <div key={groupKey} className="mb-1">
                <div className={clsx(rowBase, "hover:bg-hover")}>
                  <ToggleButton open={groupOpen} label={`Plegar ${gv.group.name}`} onToggle={() => toggle(groupKey)} />
                  <NavLink
                    to={`/grupo/${gv.group.id}`}
                    className={({ isActive }) =>
                      clsx(linkBase, "font-medium", isActive && "bg-hover", gv.group.archived === 1 && "text-muted")
                    }
                  >
                    {gv.group.name}
                  </NavLink>
                  {gv.group.archived === 1 && <Badge>Archivado</Badge>}
                </div>
                {groupOpen &&
                  gv.subjects.map((sv) => {
                    const subjectKey = `subject:${sv.id}`;
                    const subjectOpen = !collapsed.has(subjectKey);
                    return (
                      <div key={subjectKey}>
                        <div className={clsx(rowBase, "pl-4 text-muted hover:bg-hover")}>
                          <ToggleButton
                            open={subjectOpen}
                            label={`Plegar ${sv.subject.name}`}
                            onToggle={() => toggle(subjectKey)}
                          />
                          <span className="flex-1 truncate px-1.5">{sv.subject.name}</span>
                          <button
                            type="button"
                            onClick={() => setCreatingEvaluationFor(sv.id)}
                            aria-label={`Nueva evaluacion en ${sv.subject.name}`}
                            title="Nueva evaluacion"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        {subjectOpen &&
                          sv.evaluations.map((ev) => (
                            <NavLink
                              key={ev.id}
                              to={`/evaluacion/${ev.id}`}
                              className={({ isActive }) =>
                                clsx(rowBase, "pl-10 hover:bg-hover", isActive && "bg-hover font-medium")
                              }
                            >
                              <span className="truncate">{ev.title}</span>
                            </NavLink>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 flex-col gap-2 border-t border-line p-2">
          <label className="flex items-center gap-2 px-1 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Ver archivados
          </label>
          <Button variant="secondary" className="w-full" onClick={() => setCreatingGroup(true)}>
            <Plus size={14} />
            Grupo
          </Button>
          <NavLink
            to="/ajustes"
            className={({ isActive }) =>
              clsx("flex h-8 items-center gap-2 rounded px-2 hover:bg-hover", isActive && "bg-hover font-medium")
            }
          >
            <Settings size={14} />
            Ajustes
          </NavLink>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6">
          <Outlet />
        </div>
      </main>

      {creatingEvaluationFor !== null && (
        <EvaluationFormDialog
          groupSubjectId={creatingEvaluationFor}
          onClose={() => setCreatingEvaluationFor(null)}
          onCreated={(evaluation) => {
            setCreatingEvaluationFor(null);
            navigate(`/evaluacion/${evaluation.id}`);
          }}
        />
      )}

      {creatingGroup && (
        <GroupFormDialog
          onClose={() => setCreatingGroup(false)}
          onCreated={(group) => navigate(`/grupo/${group.id}`)}
        />
      )}
    </div>
  );
}

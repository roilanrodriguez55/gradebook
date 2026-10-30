import clsx from "clsx";
import { GraduationCap, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudentInGroup } from "../db/types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { Input } from "./ui/Input";

const collator = new Intl.Collator("es", { sensitivity: "base" });

// Quita acentos y pasa a minusculas para que la busqueda no dependa de tildes.
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

interface StudentTableProps {
  students: StudentInGroup[];
  carryCounts: Map<number, number>;
  groupNames: Map<number, string>;
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
  onEdit: (student: StudentInGroup) => void;
  onDelete: (student: StudentInGroup) => void;
  onPaste: () => void;
  onAdd: () => void;
  onPromote: (studentIds: number[], direction: "up" | "down") => void;
}

export function StudentTable({
  students,
  carryCounts,
  groupNames,
  selectedIds,
  onSelectedIdsChange,
  onEdit,
  onDelete,
  onPaste,
  onAdd,
  onPromote,
}: StudentTableProps) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      [...students].sort(
        (a, b) =>
          collator.compare(a.last_names, b.last_names) || collator.compare(a.first_names, b.first_names),
      ),
    [students],
  );

  const q = normalizeText(query.trim());
  const rows = sorted
    .map((student, index) => ({ student, number: index + 1 }))
    .filter(({ student }) =>
      q === ""
        ? true
        : normalizeText(`${student.first_names} ${student.last_names} ${student.github_user ?? ""}`).includes(q),
    );

  // Solo los no promovidos se pueden seleccionar para promover.
  const promotableIds = students
    .filter((s) => s.promoted_to_group_id === null && selectedIds.has(s.id))
    .map((s) => s.id);
  const visibleSelectableIds = rows
    .filter(({ student }) => student.promoted_to_group_id === null)
    .map(({ student }) => student.id);
  const allVisibleSelected =
    visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.has(id));

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function toggleAllVisible() {
    const next = new Set(selectedIds);
    for (const id of visibleSelectableIds) {
      if (allVisibleSelected) next.delete(id);
      else next.add(id);
    }
    onSelectedIdsChange(next);
  }

  if (students.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap size={32} />}
        title="Pega la lista de estudiantes"
        description="Una persona por linea, con el formato Nombres, Apellidos."
        action={
          <div className="flex gap-2">
            <Button variant="primary" onClick={onPaste}>
              Pegar lista
            </Button>
            <Button onClick={onAdd}>+ Estudiante</Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar estudiante"
            aria-label="Buscar estudiante"
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => (promotableIds.length > 0 ? onSelectedIdsChange(new Set()) : onSelectedIdsChange(new Set(visibleSelectableIds)))}
            disabled={promotableIds.length === 0 && visibleSelectableIds.length === 0}
          >
            {promotableIds.length > 0 ? "Deseleccionar" : "Seleccionar todos"}
          </Button>
          <Button onClick={() => onPromote(promotableIds, "up")} disabled={promotableIds.length === 0}>
            Promover ({promotableIds.length})
          </Button>
          <Button onClick={() => onPromote(promotableIds, "down")} disabled={promotableIds.length === 0}>
            Retroceder ({promotableIds.length})
          </Button>
          <Button onClick={onPaste}>Pegar lista</Button>
          <Button variant="primary" onClick={onAdd}>
            + Estudiante
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-left">
          <thead className="bg-hover text-muted">
            <tr className="h-9">
              <th className="w-10 px-3 font-medium">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={allVisibleSelected}
                  disabled={visibleSelectableIds.length === 0}
                  onChange={toggleAllVisible}
                  aria-label="Seleccionar todos los estudiantes visibles"
                />
              </th>
              <th className="w-12 px-3 font-medium">#</th>
              <th className="px-3 font-medium">Nombres</th>
              <th className="px-3 font-medium">Apellidos</th>
              <th className="px-3 font-medium">Usuario GitHub</th>
              <th className="px-3 font-medium">Estado</th>
              <th className="w-20 px-3 text-right font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, number }) => {
              const promotedTo = student.promoted_to_group_id;
              const promoted = promotedTo !== null;
              const carries = carryCounts.get(student.id) ?? 0;
              return (
                <tr
                  key={student.id}
                  className={clsx(
                    "h-10 border-t border-line hover:bg-hover",
                    promoted && "text-muted opacity-60",
                    !promoted && "cursor-pointer",
                    !promoted && selectedIds.has(student.id) && "bg-hover",
                  )}
                  onClick={promoted ? undefined : () => toggleOne(student.id)}
                >
                  <td className="px-3">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      disabled={promoted}
                      checked={!promoted && selectedIds.has(student.id)}
                      onChange={() => toggleOne(student.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Seleccionar ${student.first_names} ${student.last_names}`}
                    />
                  </td>
                  <td className="px-3 text-muted tabular-nums">{number}</td>
                  <td className="px-3">{student.first_names}</td>
                  <td className="px-3">{student.last_names}</td>
                  <td className="px-3 text-muted">{student.github_user ?? "-"}</td>
                  <td className="px-3">
                    <div className="flex flex-wrap gap-1">
                      {carries > 0 && <Badge tone="accent">Arrastre: {carries}</Badge>}
                      {promotedTo !== null && (
                        <Badge>Promovido a {groupNames.get(promotedTo) ?? "otro grupo"}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onEdit(student)} aria-label={`Editar ${student.first_names} ${student.last_names}`}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-danger"
                        onClick={() => onDelete(student)}
                        aria-label={`Quitar del grupo a ${student.first_names} ${student.last_names}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-6 text-center text-muted">Ningun estudiante coincide con la busqueda.</p>}
      </div>
    </div>
  );
}

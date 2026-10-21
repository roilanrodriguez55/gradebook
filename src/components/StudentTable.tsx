import { GraduationCap, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Student } from "../db/types";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { Input } from "./ui/Input";

const collator = new Intl.Collator("es", { sensitivity: "base" });

// Quita acentos y pasa a minusculas para que la busqueda no dependa de tildes.
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

interface StudentTableProps {
  students: Student[];
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
  onPaste: () => void;
  onAdd: () => void;
}

export function StudentTable({ students, onEdit, onDelete, onPaste, onAdd }: StudentTableProps) {
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
              <th className="w-12 px-3 font-medium">#</th>
              <th className="px-3 font-medium">Nombres</th>
              <th className="px-3 font-medium">Apellidos</th>
              <th className="px-3 font-medium">Usuario GitHub</th>
              <th className="w-20 px-3 text-right font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, number }) => (
              <tr key={student.id} className="h-10 border-t border-line hover:bg-hover">
                <td className="px-3 text-muted tabular-nums">{number}</td>
                <td className="px-3">{student.first_names}</td>
                <td className="px-3">{student.last_names}</td>
                <td className="px-3 text-muted">{student.github_user ?? "-"}</td>
                <td className="px-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(student)} aria-label={`Editar ${student.first_names} ${student.last_names}`}>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-danger"
                      onClick={() => onDelete(student)}
                      aria-label={`Eliminar ${student.first_names} ${student.last_names}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-6 text-center text-muted">Ningun estudiante coincide con la busqueda.</p>}
      </div>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import * as groups from "../../db/groups";
import type { Group } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useToast } from "../ui/useToast";

interface GroupFormDialogProps {
  group?: Group;
  onClose: () => void;
  onCreated?: (group: Group) => void;
}

export function GroupFormDialog({ group, onClose, onCreated }: GroupFormDialogProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [period, setPeriod] = useState(group?.period ?? "");
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const trimmedName = name.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!trimmedName || busy) return;
    setBusy(true);
    try {
      const fields = { name: trimmedName, period: period.trim() || null };
      if (group) {
        await groups.update(group.id, fields);
      } else {
        const created = await groups.create(fields);
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

  return (
    <Dialog open title={group ? "Editar grupo" : "Nuevo grupo"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
        </Field>
        <Field label="Periodo (opcional)">
          <Input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="Ej. 2026-1"
            maxLength={60}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!trimmedName || busy}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

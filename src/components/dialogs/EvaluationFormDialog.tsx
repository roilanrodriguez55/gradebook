import { useState, type FormEvent } from "react";
import * as evaluations from "../../db/evaluations";
import type { Evaluation } from "../../db/types";
import { useDataVersion } from "../../context/DataVersionContext";
import { errorMessage } from "../../lib/errorMessage";
import { Button } from "../ui/Button";
import { DatePicker } from "../ui/DatePicker";
import { Dialog } from "../ui/Dialog";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useToast } from "../ui/useToast";

interface EvaluationFormDialogProps {
  groupSubjectId: number;
  evaluation?: Evaluation;
  onClose: () => void;
  onCreated?: (evaluation: Evaluation) => void;
}

export function EvaluationFormDialog({ groupSubjectId, evaluation, onClose, onCreated }: EvaluationFormDialogProps) {
  const [title, setTitle] = useState(evaluation?.title ?? "");
  const [topic, setTopic] = useState(evaluation?.topic ?? "");
  const [dueDate, setDueDate] = useState(evaluation?.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const { refresh } = useDataVersion();
  const toast = useToast();

  const trimmedTitle = title.trim();
  const trimmedTopic = topic.trim();
  const canSubmit = !busy && trimmedTitle !== "" && trimmedTopic !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const fields = { title: trimmedTitle, topic: trimmedTopic, due_date: dueDate || null };
    try {
      if (evaluation) {
        await evaluations.update(evaluation.id, fields);
      } else {
        const created = await evaluations.create(groupSubjectId, fields);
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
    <Dialog open title={evaluation ? "Editar evaluacion" : "Nueva evaluacion"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Titulo">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} />
        </Field>
        <Field label="Tema">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ej. Ejercicio 3: listas enlazadas"
            maxLength={120}
          />
        </Field>
        <p className="-mt-2 text-xs text-muted">Se usa en el PDF y como nombre de carpeta.</p>
        <Field label="Fecha limite (opcional)">
          <DatePicker value={dueDate} onChange={setDueDate} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

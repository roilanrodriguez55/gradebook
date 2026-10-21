import { Button } from "./Button";

interface Props {
  message: string;
  onRetry: () => void;
}

export function LoadError({ message, onRetry }: Props) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-4">
      <p className="text-danger">No se pudieron cargar los datos: {message}</p>
      <Button onClick={onRetry}>Reintentar</Button>
    </div>
  );
}

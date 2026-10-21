import type { Submission } from "../db/types";

// Entregada a tiempo o tarde.
export function isDelivered(submission: Pick<Submission, "status">): boolean {
  return submission.status === "entregado" || submission.status === "tardia";
}

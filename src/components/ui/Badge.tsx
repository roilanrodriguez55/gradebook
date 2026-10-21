import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-hover text-muted",
  accent: "bg-accent/15 text-accent",
  danger: "bg-danger/15 text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

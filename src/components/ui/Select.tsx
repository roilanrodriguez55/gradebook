import clsx from "clsx";
import type { SelectHTMLAttributes } from "react";
import { fieldBase } from "./fieldStyles";

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(fieldBase, "h-8", className)} {...rest}>
      {children}
    </select>
  );
}

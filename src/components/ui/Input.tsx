import clsx from "clsx";
import type { InputHTMLAttributes } from "react";
import { fieldBase } from "./fieldStyles";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(fieldBase, "h-8", className)} {...rest} />;
}

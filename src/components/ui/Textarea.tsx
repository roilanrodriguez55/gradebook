import clsx from "clsx";
import type { TextareaHTMLAttributes } from "react";
import { fieldBase } from "./fieldStyles";

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldBase, "py-2 leading-5", className)} {...rest} />;
}

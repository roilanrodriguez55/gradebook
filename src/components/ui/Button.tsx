import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-hover",
  ghost: "hover:bg-hover",
  danger: "bg-danger text-danger-fg hover:opacity-90",
};

export type ButtonSize = "md" | "sm" | "xs" | "icon" | "icon-sm";

const sizes: Record<ButtonSize, string> = {
  md: "h-8 px-3",
  sm: "h-7 px-2",
  xs: "h-6 px-2",
  icon: "h-7 w-7 p-0",
  "icon-sm": "h-6 w-6 p-0",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50",
        sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}

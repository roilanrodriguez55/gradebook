import { createContext, useContext } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export type ToastVariant = "error" | "success" | "info";

export interface ToastOptions {
  variant?: ToastVariant;
}

export interface ToastApi {
  show: (message: string, action?: ToastAction, options?: ToastOptions) => void;
}

export const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

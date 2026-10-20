import { create } from "zustand";

export type ToastKind = "success" | "error" | "warning" | "info";

/** Optional button on a toast (e.g. "Hoàn tác"); clicking it runs `onClick` and closes the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  durationMs?: number;
  action?: ToastAction;
}

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string, opts?: number | ToastOptions) => number;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  warning: 5500,
  error: 7000,
};
const MAX_VISIBLE = 4;

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message, opts) => {
    const { durationMs, action } = typeof opts === "number" ? { durationMs: opts, action: undefined } : opts ?? {};
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, action }].slice(-MAX_VISIBLE) }));
    // A toast with an action stays longer so the user has time to press it
    const ms = durationMs ?? (action ? 8000 : DEFAULT_DURATION[kind]);
    if (ms > 0 && typeof window !== "undefined") {
      window.setTimeout(() => get().dismiss(id), ms);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Non-blocking replacement for `alert()`; callable from components and plain modules/stores. */
export const toast = {
  success: (message: string, opts?: number | ToastOptions) => useToastStore.getState().push("success", message, opts),
  error: (message: string, opts?: number | ToastOptions) => useToastStore.getState().push("error", message, opts),
  warning: (message: string, opts?: number | ToastOptions) => useToastStore.getState().push("warning", message, opts),
  info: (message: string, opts?: number | ToastOptions) => useToastStore.getState().push("info", message, opts),
};

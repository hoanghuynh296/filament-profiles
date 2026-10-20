import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  /** Body text; "\n" starts a new line. */
  message?: string;
  /** Label of the button that does the action, e.g. "Xoá" (default "Đồng ý"). */
  confirmLabel?: string;
  /** Label of the button that backs out, e.g. "Giữ lại" (default "Huỷ"). */
  cancelLabel?: string;
  /** "danger" paints the confirm button red (delete, stop, discard). */
  tone?: "default" | "danger";
}

interface ConfirmState {
  current: (ConfirmOptions & { id: number }) | null;
  open: (opts: ConfirmOptions) => Promise<boolean>;
  resolve: (ok: boolean) => void;
}

let nextId = 1;
let pending: ((ok: boolean) => void) | null = null;

export const useConfirmStore = create<ConfirmState>((set) => ({
  current: null,
  open: (opts) =>
    new Promise<boolean>((resolve) => {
      // A dialog opened while another is showing cancels the first one
      pending?.(false);
      pending = resolve;
      set({ current: { ...opts, id: nextId++ } });
    }),
  resolve: (ok) => {
    const done = pending;
    pending = null;
    set({ current: null });
    done?.(ok);
  },
}));

/** App-styled replacement for `window.confirm()`: resolves true when the user picks the confirm button. */
export const confirmDialog = (opts: ConfirmOptions) => useConfirmStore.getState().open(opts);

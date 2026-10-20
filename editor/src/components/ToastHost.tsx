import React from "react";
import { useToastStore, type ToastKind } from "../store/toastStore";

const STYLES: Record<ToastKind, { icon: string; box: string; path: string }> = {
  success: {
    icon: "text-emerald-400",
    box: "bg-emerald-500/15 border-emerald-500/30",
    path: "M5 13l4 4L19 7",
  },
  error: {
    icon: "text-rose-400",
    box: "bg-rose-500/15 border-rose-500/30",
    path: "M6 18L18 6M6 6l12 12",
  },
  warning: {
    icon: "text-amber-400",
    box: "bg-amber-500/15 border-amber-500/30",
    path: "M12 8v5m0 3.5h.01",
  },
  info: {
    icon: "text-sky-400",
    box: "bg-sky-500/15 border-sky-500/30",
    path: "M12 11v5m0-8.5h.01",
  },
};

/** Mounted once in the root layout. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="fixed z-[10000] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 flex flex-col items-center sm:items-end gap-2 px-4 pb-4 sm:p-0 pointer-events-none"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      aria-live="polite"
    >
      {toasts.map((t) => {
        const st = STYLES[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto w-full sm:w-auto sm:min-w-[280px] sm:max-w-[420px] bg-field border border-line-hover rounded-xl shadow-2xl px-3 py-2.5 flex items-start gap-2.5 cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <span className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-px ${st.box} ${st.icon}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d={st.path} />
              </svg>
            </span>
            <div className="min-w-0 flex-1 text-[13px] text-gray-100 whitespace-pre-line break-words leading-snug pt-0.5">
              {t.message}
            </div>
            {t.action && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-semibold text-primary-400 hover:bg-white/[0.08] transition"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-gray-500 hover:text-white transition mt-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

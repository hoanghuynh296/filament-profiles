import React, { useEffect } from "react";
import { useConfirmStore } from "../store/confirmStore";

/** Mounted once in the root layout; renders the dialog opened by `confirmDialog()`. */
export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current);
  const resolve = useConfirmStore((s) => s.resolve);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        resolve(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [current, resolve]);

  if (!current) return null;
  const danger = current.tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-lg"
      onClick={() => resolve(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="bg-field border border-line rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 space-y-2">
          <h3 id="confirm-title" className="text-[15px] font-semibold text-white">
            {current.title}
          </h3>
          {current.message && (
            <p className="text-[13px] text-gray-400 leading-relaxed whitespace-pre-line">{current.message}</p>
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => resolve(false)}
            className="px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-line text-[13px] font-medium text-white transition-colors"
          >
            {current.cancelLabel || "Huỷ"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => resolve(true)}
            className={
              danger
                ? "px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[13px] font-medium transition-colors border border-rose-500/20"
                : "px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-[13px] font-medium text-white transition-colors shadow-[0_0_15px_rgba(0,174,66,0.3)]"
            }
          >
            {current.confirmLabel || "Đồng ý"}
          </button>
        </div>
      </div>
    </div>
  );
}

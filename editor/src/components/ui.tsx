import React from "react";

/** Small inline icon set for the catalogue editor (stroke icons, 1.75). */
const PATHS: Record<string, string> = {
  back: "M15 18l-6-6 6-6",
  pull: "M12 4v12m0 0l-5-5m5 5l5-5M5 20h14",
  push: "M12 20V8m0 0l-5 5m5-5l5 5M5 4h14",
  plus: "M12 5v14M5 12h14",
  pencil: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  x: "M6 6l12 12M18 6L6 18",
  warn: "M12 9v4M12 17h.01M10.3 3.9L2.4 17.6A2 2 0 004.1 20.6h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01",
  cart: "M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01",
  check: "M5 12l5 5L20 7",
  shield: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z",
};

export function Icon({ name, className = "w-4 h-4" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] || ""} />
    </svg>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "primary" | "danger" | "ghost" };

const TONES = {
  default: "bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 hover:text-white border border-line",
  primary: "bg-primary-500 hover:bg-primary-600 text-white border border-transparent",
  danger: "text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent",
  ghost: "text-gray-400 hover:text-white hover:bg-white/[0.06] border border-transparent",
};

/** Text button (icon + label) used across the editor. */
export function Btn({ tone = "default", className = "", children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 h-10 md:h-8 px-3 rounded-lg text-[13px] md:text-[12px] font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-default ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Square icon-only button; always visible (no hover-only actions, so it works on iPad). */
export function IconBtn({ icon, label, tone = "ghost", className = "", ...rest }: BtnProps & { icon: string; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={`inline-flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-lg transition cursor-pointer disabled:opacity-40 ${TONES[tone]} ${className}`}
    >
      <Icon name={icon} />
    </button>
  );
}

/** Input look without a width (for inputs sized by their row). */
export const inputBase =
  "bg-field border border-line rounded-lg px-3 h-10 md:h-9 text-[13px] text-white placeholder:text-gray-500 outline-none focus:border-primary-500/60";
export const inputCls = `w-full ${inputBase}`;

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-gray-400">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

/** Centered dialog with title, body and a footer (left slot for destructive actions). */
export function Modal({
  title,
  onClose,
  children,
  footer,
  footerLeft,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  footerLeft?: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className={`bg-panel border border-line rounded-t-2xl sm:rounded-2xl w-full ${width} max-h-[90dvh] flex flex-col shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-[15px] font-semibold text-white tracking-tight">{title}</h3>
          <IconBtn icon="x" label="Đóng" onClick={onClose} />
        </div>
        <div className="px-5 py-2 overflow-y-auto custom-scrollbar flex flex-col gap-4">{children}</div>
        {(footer || footerLeft) && (
          <div className="flex items-center justify-between gap-2 px-5 py-4">
            <div>{footerLeft}</div>
            <div className="flex items-center gap-2">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Bambu Lab" + "Bambu PLA Basic" -> "PLA Basic" (lines repeat the brand in their name). */
export function shortLineName(name: string, brand?: string | null): string {
  if (!brand) return name;
  const words = [brand, brand.split(/\s+/)[0]];
  for (const w of words) {
    if (w && name.toLowerCase().startsWith(w.toLowerCase() + " ")) return name.slice(w.length + 1);
  }
  return name;
}

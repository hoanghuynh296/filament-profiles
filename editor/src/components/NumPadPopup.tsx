import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** True on devices with a touch screen (phones, tablets). Re-evaluated on change.
 * Not just `(pointer: coarse)`: an iPad with a Magic Keyboard / trackpad (typically landscape) reports a fine
 * primary pointer, and iPadOS "desktop website" mode looks like a Mac; both still have a touch screen
 * (`any-pointer: coarse`, `maxTouchPoints`). Macs report 0 touch points. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const queries = ["(pointer: coarse)", "(any-pointer: coarse)"].map((q) => window.matchMedia(q));
    const update = () => setCoarse(queries.some((mq) => mq.matches) || (navigator.maxTouchPoints || 0) > 1);
    update();
    queries.forEach((mq) => mq.addEventListener("change", update));
    return () => queries.forEach((mq) => mq.removeEventListener("change", update));
  }, []);
  return coarse;
}

/** Tiny safe arithmetic evaluator: numbers, + - * / ( ) and unary minus. */
function evaluate(expr: string): number | null {
  const src = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
  if (!src || !/^[0-9+\-*/().]+$/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = parseFactor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const parseFactor = (): number => {
    if (peek() === "-") {
      i++;
      return -parseFactor();
    }
    if (peek() === "+") {
      i++;
      return parseFactor();
    }
    if (peek() === "(") {
      i++;
      const v = parseExpr();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(i));
    if (!m) throw new Error("num");
    i += m[0].length;
    return parseFloat(m[0]);
  };
  try {
    const v = parseExpr();
    if (i !== src.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

function formatNumber(n: number, integer: boolean): string {
  if (integer) return String(Math.round(n));
  return String(parseFloat(n.toFixed(6)));
}

interface NumPadPopupProps {
  label: string;
  unit?: string;
  initial: string;
  /** whole numbers only */
  integer?: boolean;
  /** allow a trailing % (value like "15%") */
  allowPercent?: boolean;
  onCommit: (value: string) => void;
  onClose: () => void;
}

const OPS = ["÷", "×", "−", "+"];

export function NumPadPopup({ label, unit, initial, integer, allowPercent, onCommit, onClose }: NumPadPopupProps) {
  const [text, setText] = useState(initial);
  const [fresh, setFresh] = useState(true); // next digit replaces the initial value
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const press = (k: string) => {
    setError(false);
    if (/^[0-9]$/.test(k) || k === ".") {
      if (k === "." && integer) return;
      setText((t) => {
        const base = fresh ? "" : t;
        if (k === ".") {
          const lastNum = base.split(/[÷×−+()%]/).pop() ?? "";
          if (lastNum.includes(".")) return base;
          return base + (lastNum === "" ? "0." : ".");
        }
        if (base.endsWith("%")) return base;
        return base + k;
      });
      setFresh(false);
    } else if (OPS.includes(k)) {
      setText((t) => {
        if (t === "") return k === "−" ? "−" : t;
        if (t.endsWith("%")) return t;
        if (OPS.includes(t.slice(-1))) return t.slice(0, -1) + k;
        return t + k;
      });
      setFresh(false);
    } else if (k === "(" || k === ")") {
      setText((t) => (fresh ? "" : t) + k);
      setFresh(false);
    } else if (k === "%") {
      setText((t) => (/^−?\d*\.?\d+$/.test(t) ? t + "%" : t));
      setFresh(false);
    } else if (k === "±") {
      setText((t) => (t.startsWith("−") ? t.slice(1) : t === "" ? "−" : "−" + t));
      setFresh(false);
    } else if (k === "⌫") {
      setText((t) => t.slice(0, -1));
      setFresh(false);
    } else if (k === "C") {
      setText("");
      setFresh(false);
    }
  };

  const confirm = () => {
    const t = text.trim();
    if (t === "") {
      onCommit("");
      onClose();
      return;
    }
    if (allowPercent && /^−?\d*\.?\d+%$/.test(t)) {
      onCommit(t.replace("−", "-"));
      onClose();
      return;
    }
    const v = evaluate(t);
    if (v === null) {
      setError(true);
      return;
    }
    onCommit(formatNumber(v, !!integer));
    onClose();
  };

  const keyCls =
    "h-12 sm:h-14 rounded-xl bg-raised text-gray-100 text-lg font-medium active:bg-line transition-colors select-none touch-manipulation cursor-pointer flex items-center justify-center";
  const mute = "text-gray-300";

  const renderKey = (k: string, cls = "", children?: React.ReactNode) => (
    <button key={k} type="button" className={`${keyCls} ${cls}`} onClick={() => press(k)}>
      {children ?? k}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-field border border-line rounded-2xl p-3 shadow-2xl text-gray-100"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-[13px] font-medium text-gray-400 truncate">{label}</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div
          className={`flex items-center justify-between gap-2 rounded-xl bg-panel border px-3 h-12 mb-2.5 ${
            error ? "border-red-500" : "border-line"
          }`}
        >
          <span
            className={`text-xl tabular-nums truncate flex-1 text-right ${
              fresh && text ? "bg-primary-500/25 rounded px-1" : ""
            }`}
          >
            {text || <span className="text-gray-600">0</span>}
          </span>
          {unit && <span className="text-[13px] text-gray-500 font-mono flex-shrink-0">{unit}</span>}
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {renderKey("(", mute)}
          {renderKey(")", mute)}
          {allowPercent ? renderKey("%", mute) : renderKey("C", mute)}
          {renderKey("⌫", mute,
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75 14.25 12m0 0 2.25 2.25M14.25 12l2.25-2.25M14.25 12 12 14.25m-2.58 4.92-6.374-6.375a.75.75 0 0 1 0-1.06l6.374-6.375a1.5 1.5 0 0 1 1.06-.44H19.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H10.48a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {renderKey("7")}
          {renderKey("8")}
          {renderKey("9")}
          {renderKey("÷", mute)}
          {renderKey("4")}
          {renderKey("5")}
          {renderKey("6")}
          {renderKey("×", mute)}
          {renderKey("1")}
          {renderKey("2")}
          {renderKey("3")}
          {renderKey("−", mute)}
          {renderKey("±", mute)}
          {renderKey("0")}
          {renderKey(".", integer ? "opacity-30" : "")}
          {renderKey("+", mute)}
        </div>

        <button
          type="button"
          onClick={confirm}
          className="mt-2 w-full h-12 rounded-xl bg-primary-500 hover:bg-primary-400 active:bg-primary-600 text-white flex items-center justify-center cursor-pointer touch-manipulation"
          aria-label="Xác nhận"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}

// Drop-in <input> for numbers: on touch screens (phone / iPad: `pointer: coarse`) it opens the app's
// NumPadPopup instead of the system keyboard; elsewhere it is a plain input. The value typed on the pad is
// written to the element and an `input` event is dispatched, so the caller's onChange (controlled) or the
// DOM value (uncontrolled, defaultValue) and onBlur work unchanged.
import React, { useRef, useState } from "react";
import { NumPadPopup, useCoarsePointer } from "./NumPadPopup";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "inputMode"> & {
  ref?: React.Ref<HTMLInputElement>;
  /** Title shown on the numpad (defaults to aria-label / placeholder). */
  numpadLabel?: string;
  /** Unit shown next to the value on the numpad. */
  unit?: string;
  /** Whole numbers only (no decimal key). */
  integer?: boolean;
};

const setNativeValue = (el: HTMLInputElement, v: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

export function NumberInput({ ref, numpadLabel, unit, integer, onClick, readOnly, disabled, type = "number", ...rest }: Props) {
  const coarse = useCoarsePointer();
  const own = useRef<HTMLInputElement | null>(null);
  const [pad, setPad] = useState<string | null>(null);
  const usePad = coarse && !readOnly && !disabled;

  const setRefs = (el: HTMLInputElement | null) => {
    own.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.RefObject<HTMLInputElement | null>).current = el;
  };

  return (
    <>
      <input
        {...rest}
        ref={setRefs}
        type={usePad ? "text" : type}
        inputMode={usePad ? "none" : integer ? "numeric" : "decimal"}
        readOnly={readOnly || usePad}
        disabled={disabled}
        onClick={(e) => {
          if (usePad) setPad(e.currentTarget.value);
          onClick?.(e);
        }}
      />
      {pad !== null && (
        <NumPadPopup
          label={numpadLabel || rest["aria-label"] || rest.placeholder || "Nhập số"}
          unit={unit}
          initial={pad}
          integer={integer}
          onClose={() => setPad(null)}
          onCommit={(v) => {
            const el = own.current;
            if (!el) return;
            setNativeValue(el, v);
            el.focus();
            el.blur(); // callers that apply on blur (3D transform panel)
          }}
        />
      )}
    </>
  );
}

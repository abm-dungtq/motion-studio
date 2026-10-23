// Port of the press handling of public/panels.js:568-572 (render = press.run(draw)); behaviour
// unchanged. While a mouse press or a Space press on a button is in progress inside the right
// column, the chat keeps the value it showed when the press began; the newest value is applied
// once the press ends, after the click that ends it has been dispatched (setTimeout 0), or when
// the window loses focus. A button taken out of the page between mousedown and mouseup gets no
// click (Chromium), so the chat must not change under a press (core/gate-cards.ts).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { pressGate } from "@/core/gate-cards.ts";

// The element whose presses hold redraws: the right column's director slot, or root itself.
const scope = (root: HTMLElement): HTMLElement => root.closest<HTMLElement>('[data-slot="right.director"]') ?? root;

export function usePressGate<T>(value: T, rootRef: RefObject<HTMLElement | null>): T {
  const gate = useRef(pressGate()).current;
  const [shown, setShown] = useState(value);

  // Before paint, so an unheld change never shows the old value for a frame.
  useLayoutEffect(() => { gate.run(() => setShown(value)); }, [gate, value]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const el = scope(root);
    const release = () => {
      if (!gate.pressed) return;
      const fn = gate.release();
      if (fn) setTimeout(fn);
    };
    const down = (e: PointerEvent) => { if (e.button === 0) gate.press(); };
    const key = (e: KeyboardEvent) => { if (e.key === " " && e.target instanceof Element && e.target.matches("button")) gate.press(); };
    const keyUp = (e: KeyboardEvent) => { if (e.key === " ") release(); };
    // The window itself losing focus, not a field inside it.
    const blur = (e: FocusEvent) => { if (e.target === window) release(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("keydown", key);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("keydown", key);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("blur", blur);
      gate.release();
    };
  }, [gate, rootRef]);

  return shown;
}

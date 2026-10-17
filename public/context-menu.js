// context-menu.js — one small menu at a time at (x, y): items [{ label, run, disabled? }]. Closes on a
// click outside, Escape, or after an item runs; ↑/↓ move between items and Enter runs one. Keys
// pressed inside the menu stay inside, so timeline shortcuts do not fire under it.
import { h } from "/dom.js";

let current = null;

export function closeMenu() {
  if (!current) return;
  const { el, off } = current;
  current = null;
  off();
  el.remove();
}

export function openMenu(x, y, items) {
  closeMenu();
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return null;
  const buttons = list.map((it) => h("button", {
    class: "ctx-item", type: "button", role: "menuitem", disabled: Boolean(it.disabled),
    onclick: () => { closeMenu(); it.run?.(); },
  }, it.label));
  const el = h("div", { class: "ctx-menu", role: "menu" }, buttons);
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;

  const live = () => buttons.filter((b) => !b.disabled);
  const focusAt = (i) => { const l = live(); if (l.length) l[(i + l.length) % l.length].focus(); };
  el.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const l = live();
    const i = l.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusAt(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusAt(i < 0 ? -1 : i - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (i >= 0) l[i].click(); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); closeMenu(); }
  });
  const outside = (e) => { if (!el.contains(e.target)) closeMenu(); };
  const esc = (e) => { if (e.key === "Escape") closeMenu(); };
  // Registered after this event loop turn, so the click or contextmenu that opened it does not close it.
  const timer = setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc, true);
  });
  current = {
    el,
    off: () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", esc, true);
    },
  };
  focusAt(0);
  return el;
}

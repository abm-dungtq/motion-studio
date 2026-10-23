// Port of h() from public/dom.js (commit 2d65edf); logic unchanged. Builds DOM outside React (the
// player's iframe). Text always goes in as text nodes, never as HTML. No React.
const PROPS = new Set(["value", "checked", "disabled", "selected", "hidden"]);

type Kid = Node | string | number | null | undefined | false | Kid[];

export function h(tag: string, props: Record<string, unknown> | null = {}, ...kids: Kid[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "style") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v as EventListener);
    else if (PROPS.has(k)) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of (kids as unknown[]).flat(Infinity) as (Node | string | number | null | undefined | false)[]) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

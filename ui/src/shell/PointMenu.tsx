// A small menu at the point of a click (replaces public/context-menu.js): openPointMenu(x, y, items)
// with items [{ label, run, disabled? }]. One menu at a time; it closes on a click outside, on
// Escape, or after an item runs. ↑/↓/Enter come from Radix. Keys pressed inside the menu stay
// inside, so the timeline's shortcuts do not fire under it. <PointMenuHost/> is mounted once by App.
import { useSyncExternalStore } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface PointMenuItem { label: string; run?: () => void; disabled?: boolean }
interface MenuState { x: number; y: number; items: PointMenuItem[]; key: number }

let menu: MenuState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const changed = () => { for (const fn of listeners) fn(); };

export function closePointMenu(): void {
  if (!menu) return;
  menu = null;
  changed();
}

// Opens the menu (closing any other). Items that are null/false are skipped; no items, no menu.
export function openPointMenu(x: number, y: number, items: (PointMenuItem | null | false | undefined)[]): void {
  const list = (items ?? []).filter(Boolean) as PointMenuItem[];
  menu = list.length ? { x, y, items: list, key: ++seq } : null;
  changed();
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function PointMenuHost() {
  const m = useSyncExternalStore(subscribe, () => menu, () => menu);
  if (!m) return null;
  const x = Math.max(4, Math.min(m.x, window.innerWidth - 4));
  const y = Math.max(4, Math.min(m.y, window.innerHeight - 4));
  return (
    <DropdownMenu key={m.key} open onOpenChange={(open) => { if (!open) closePointMenu(); }}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" data-point-menu-anchor="" style={{ position: "fixed", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        onKeyDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {m.items.map((it, i) => (
          <DropdownMenuItem key={i} disabled={Boolean(it.disabled)} onSelect={() => { closePointMenu(); it.run?.(); }}>
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

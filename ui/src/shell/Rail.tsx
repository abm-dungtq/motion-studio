// The icon rail (public/panels.js:92-100, :518-530, :576-593): one icon button per registered tab,
// in groups (assets, audio, library, extra) with a line between groups, a tooltip
// "<label> (Alt+<n>)", a count badge, and ARIA tabs keys: ↑/↓ (and ←/→), Home and End move along
// the rail with a roving tabindex; Alt+1…9 picks a tab from anywhere except a field or a dialog.
// e.code, not e.key: on macOS Alt+digit types a symbol (Alt+1 → "¡").
import { Fragment, useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabs, type Tab } from "@/ext/registry.ts";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio.ts";

export const LEFT_PANEL_ID = "left-panel";

// Pick a tab: show it, open the panel when it was collapsed, optionally focus its rail button.
export function selectTab(id: string, focus = false): void {
  const s = useStudio.getState();
  s.setLeftTab(id);
  if (s.leftCollapsed) s.toggleLeft(true);
  if (focus) document.getElementById(`tab-${id}`)?.focus();
}

function RailButton({ tab, index, active }: { tab: Tab; index: number; active: boolean }) {
  const n = tab.badge ? Number(tab.badge()) || 0 : 0;
  const Icon = tab.icon;
  const hint = index < 9 ? `${tab.label} (Alt+${index + 1})` : tab.label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          data-tab={tab.id}
          aria-selected={active}
          aria-controls={LEFT_PANEL_ID}
          aria-label={n ? `${tab.label}, ${n} việc chờ bạn` : tab.label}
          tabIndex={active ? 0 : -1}
          onClick={() => selectTab(tab.id)}
          className={cn(
            "relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-panel-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active && "bg-panel-2 text-foreground ring-1 ring-primary",
          )}
        >
          <Icon size={20} aria-hidden />
          {n ? (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warn px-1 text-center text-[10px] leading-4 font-semibold text-background">
              {n > 99 ? "99+" : n}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function Rail() {
  const tabs = useTabs();
  const leftTab = useStudio((s) => s.leftTab);
  const ids = useRef<string[]>([]);
  ids.current = tabs.map((t) => t.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const target = e.target as Element | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]") || document.querySelector("[role=\"dialog\"]")) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      const id = m ? ids.current[Number(m[1]) - 1] : undefined;
      if (!id) return;
      e.preventDefault();
      selectTab(id, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = ids.current;
    if (!list.length) return;
    const i = Math.max(0, list.indexOf(useStudio.getState().leftTab));
    const next = ({ ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 } as Record<string, number>)[e.key];
    if (next == null) return;
    e.preventDefault();
    e.stopPropagation();
    selectTab(list[(next + list.length) % list.length], true);
  };

  return (
    <nav
      data-slot="rail"
      role="tablist"
      aria-label="Khu làm việc"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-2"
    >
      {tabs.map((t, i) => (
        <Fragment key={t.id}>
          {i > 0 && tabs[i - 1].group !== t.group ? <div data-rail-sep="" aria-hidden="true" className="my-1 h-px w-6 bg-border" /> : null}
          <RailButton tab={t} index={i} active={t.id === leftTab} />
        </Fragment>
      ))}
    </nav>
  );
}

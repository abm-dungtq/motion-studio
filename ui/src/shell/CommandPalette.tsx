// The command palette: Cmd+K (Ctrl+K), also while typing in a field, opens a search over the
// commands of core/commands.ts (open a project, go to a tab or a shot, undo, export, ...). Arrows,
// Home and End move, Enter runs the active command and closes, Escape closes. On close the focus
// goes back where it was, then the command runs, so a command that moves the focus (a tab) wins.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { actions } from "@/api/actions.ts";
import { useNotes, useProject, useProjects } from "@/api/queries.ts";
import { buildCommands, type Command } from "@/core/commands.ts";
import { readRecent } from "@/core/recent.ts";
import { getTabs } from "@/ext/registry.ts";
import { cn } from "@/lib/utils";
import { sendOpenNotes } from "@/panels/notes/NotesList.tsx";
import { useStudio } from "@/store/studio.ts";
import { filterOptions } from "./Combobox.tsx";
import { selectTab } from "./Rail.tsx";

const MAX = 50;
const GROUPS: Command["group"][] = ["Đi tới", "Sửa", "Xem", "Xuất", "Dự án"];

function useCommands(): Command[] {
  const name = useStudio((s) => s.name);
  const { data: projects } = useProjects();
  const { data: m } = useProject(name);
  const { data: notes } = useNotes(name);
  return useMemo(() => {
    const s = useStudio.getState;
    const right = (t: "director" | "shot") => { s().setRightTab(t); s().toggleRight(true); };
    return buildCommands({
      projects: projects ?? [],
      recent: readRecent(),
      shots: m?.shots ?? [],
      editable: Boolean(m?.capabilities?.editable),
      leftTabs: getTabs(),
      openNotes: (notes?.notes ?? []).filter((n) => n.state === "open").length,
      run: {
        open: (n) => actions.open(n),
        newProject: () => s().openDialog("new-project"),
        leftTab: (id) => { s().toggleLeft(true); selectTab(id, true); },
        rightTab: right,
        shot: (id, start) => { actions.select(id); actions.seek(start); },
        undo: () => actions.undo(),
        redo: () => actions.redo(),
        exportVideo: () => s().openDialog("export"),
        recheckGates: () => actions.recheckGates(),
        jobs: () => s().setTrayOpen(true),
        toggleQa: () => s().setQaLayer(!s().qaLayer),
        sendNotes: () => { if (!name) return; right("director"); return sendOpenNotes(name); },
      },
    });
  }, [name, projects, m, notes]);
}

// The commands that match q, in the order of GROUPS, at most MAX.
export function matchCommands(commands: Command[], q: string): Command[] {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const hits = filterOptions(commands.map((c) => ({ value: c.id, label: c.label, hint: c.group })), q).map((o) => byId.get(o.value)!);
  return GROUPS.flatMap((g) => hits.filter((c) => c.group === g)).slice(0, MAX);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const back = useRef<HTMLElement | null>(null);
  const pending = useRef<Command | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const base = useId();
  const optId = (i: number) => `${base}-c${i}`;
  const commands = useCommands();
  const shown = useMemo(() => matchCommands(commands, q), [commands, q]);
  const can = (c: Command | undefined) => Boolean(c && (c.enabled?.() ?? true));

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((o) => {
        if (!o) { back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setQ(""); }
        return true;
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // A new search starts on its first command that can run.
  useEffect(() => { setActive(Math.max(0, shown.findIndex(can))); }, [shown]);

  const move = (i: number) => {
    if (!shown.length) return;
    const n = Math.max(0, Math.min(shown.length - 1, i));
    setActive(n);
    list.current?.querySelector(`#${CSS.escape(optId(n))}`)?.scrollIntoView({ block: "nearest" });
  };
  const run = (c: Command | undefined) => {
    if (!c || !can(c)) return;
    pending.current = c;
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    if (k === "ArrowDown") move(active + 1);
    else if (k === "ArrowUp") move(active - 1);
    else if (k === "Home") move(0);
    else if (k === "End") move(shown.length - 1);
    else if (k === "Enter") run(shown[active]);
    else return;
    e.preventDefault();
  };
  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    if (back.current?.isConnected) back.current.focus();
    back.current = null;
    const c = pending.current;
    pending.current = null;
    if (c) void c.run();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} onCloseAutoFocus={onCloseAutoFocus} className="top-[15vh] translate-y-0 gap-0 p-0 sm:max-w-xl" data-testid="command-palette">
        <DialogTitle className="sr-only">Bảng lệnh</DialogTitle>
        <DialogDescription className="sr-only">Gõ để tìm lệnh, mũi tên để chọn, Enter để chạy, Escape để đóng.</DialogDescription>
        <input
          autoFocus
          aria-label="Tìm lệnh"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${base}-list`}
          aria-activedescendant={shown.length ? optId(active) : undefined}
          placeholder="Gõ lệnh, tên tab, shot hay dự án…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        {shown.length ? (
          <ul ref={list} id={`${base}-list`} role="listbox" aria-label="Lệnh" className="m-0 max-h-[min(420px,60vh)] list-none overflow-y-auto p-1">
            {GROUPS.map((g) => {
              const items = shown.map((c, i) => ({ c, i })).filter(({ c }) => c.group === g);
              if (!items.length) return null;
              return (
                <li key={g} role="presentation">
                  <div role="presentation" className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{g}</div>
                  <ul role="group" aria-label={g} className="m-0 list-none p-0">
                    {items.map(({ c, i }) => {
                      const off = !can(c);
                      return (
                        <li
                          key={c.id}
                          id={optId(i)}
                          role="option"
                          aria-selected={i === active}
                          aria-disabled={off || undefined}
                          onMouseMove={() => { if (i !== active) setActive(i); }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => run(c)}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm",
                            i === active && "bg-muted",
                            off && "cursor-not-allowed opacity-50",
                          )}
                        >
                          <span className="min-w-0 truncate">{c.label}</span>
                          {c.keys ? <kbd className="flex-none text-xs text-muted-foreground">{c.keys}</kbd> : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : <p className="m-0 p-3 text-sm text-muted-foreground">Không có lệnh nào khớp.</p>}
      </DialogContent>
    </Dialog>
  );
}

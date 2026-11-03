// The commands of the Cmd+K palette (shell/CommandPalette.tsx), built from what is open now. The
// caller passes the data and the functions that act (actions, the store), so this file stays free of
// React and of the app's modules.

export type CommandGroup = "Dự án" | "Đi tới" | "Sửa" | "Xuất" | "Xem";
export interface Command {
  id: string;
  label: string;
  group: CommandGroup;
  keys?: string;
  run: () => void | Promise<void>;
  enabled?: () => boolean;
}

export interface CommandContext {
  projects: readonly { name: string; has_manifest: boolean }[];
  recent: readonly string[];                       // newest first (core/recent.ts)
  shots: readonly { id: string; start: number }[]; // of the open project, [] when none
  editable: boolean;
  leftTabs: readonly { id: string; label: string }[];
  openNotes: number;                               // notes not yet sent to the director
  run: {
    open(name: string): void | Promise<void>;
    newProject(): void;
    leftTab(id: string): void;
    rightTab(id: "director" | "shot"): void;
    shot(id: string, start: number): void;
    undo(): void | Promise<void>;
    redo(): void | Promise<void>;
    exportVideo(): void;
    jobs(): void;
    toggleQa(): void;
    sendNotes(): void | Promise<void>;
  };
}

// In the order the palette lists them when nothing is typed: where to go, edits, view, export, then
// the projects (those opened lately first).
export function buildCommands(ctx: CommandContext): Command[] {
  const r = ctx.run;
  const out: Command[] = [];
  for (const t of ctx.leftTabs) out.push({ id: `tab:${t.id}`, label: `Đi tới tab ${t.label}`, group: "Đi tới", run: () => r.leftTab(t.id) });
  out.push({ id: "tab:director", label: "Đi tới tab Đạo diễn", group: "Đi tới", run: () => r.rightTab("director") });
  out.push({ id: "tab:shot", label: "Đi tới tab Shot", group: "Đi tới", run: () => r.rightTab("shot") });
  ctx.shots.forEach((s, i) => out.push({ id: `shot:${s.id}`, label: `Tới shot ${i + 1} · ${s.id}`, group: "Đi tới", run: () => r.shot(s.id, s.start) }));

  const editable = () => ctx.editable;
  out.push({ id: "undo", label: "Hoàn tác", group: "Sửa", keys: "⌘Z", run: r.undo, enabled: editable });
  out.push({ id: "redo", label: "Làm lại", group: "Sửa", keys: "⌘⇧Z", run: r.redo, enabled: editable });
  if (ctx.openNotes > 0) out.push({ id: "notes:send", label: `Giao đạo diễn sửa ${ctx.openNotes} ghi chú`, group: "Sửa", run: r.sendNotes });

  out.push({ id: "qa", label: "Bật/tắt lớp QA", group: "Xem", run: r.toggleQa });
  out.push({ id: "jobs", label: "Mở khay việc", group: "Xem", run: r.jobs });
  out.push({ id: "export", label: "Xuất video", group: "Xuất", run: r.exportVideo });

  out.push({ id: "new-project", label: "Dự án mới", group: "Dự án", run: r.newProject });
  const rank = (n: string) => { const i = ctx.recent.indexOf(n); return i < 0 ? Infinity : i; };
  const projects = ctx.projects.filter((p) => p.has_manifest).map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p.name) - rank(b.p.name) || a.i - b.i);
  for (const { p } of projects) out.push({ id: `open:${p.name}`, label: `Mở dự án: ${p.name}`, group: "Dự án", run: () => r.open(p.name) });
  return out;
}

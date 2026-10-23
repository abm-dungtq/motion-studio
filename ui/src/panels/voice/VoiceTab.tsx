// Port of public/panels.js; behaviour unchanged.
// The "Lời & giọng" tab (panels.js voice(), :193-211): one card per line with its text, the
// viet-pro gate badge and "Lưu lời"; a stale line also gets the reminder and a request to the
// director. A new manifest redraws the cards unless the user is typing in this tab
// (panels.js:595-601), so a half-typed line survives an outside patch.
import { useEffect, useRef, useState, type RefObject } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { useProject } from "@/api/queries.ts";
import type { Line } from "@/api/types.ts";
import { Button, Textarea } from "@/shell/controls.tsx";
import { Empty, NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { cn } from "@/lib/utils";

export const REDUB = "Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại";
export const redubRequest = (id: string): string => `Câu ${id} đã sửa lời: chạy cổng viet-pro cho câu này rồi lồng tiếng lại riêng câu đó.`;

const GATE_BADGE: Record<string, string> = {
  pass: "border-ok/50 bg-ok/10 text-ok",
  stale: "border-warn/50 bg-warn/10 text-warn",
};

// The old typing(): focus is in this panel, on a textarea or a text/search input.
function typingIn(root: RefObject<HTMLElement | null>): boolean {
  const el = document.activeElement;
  return Boolean(el && root.current?.contains(el) && el.matches("textarea, input[type=text], input[type=search]"));
}

function LineCard({ line, n, editable, version, root }: { line: Line; n: number; editable: boolean; version: number; root: RefObject<HTMLElement | null> }) {
  const text = line.text ?? "";
  const [draft, setDraft] = useState(text);
  // Follow the manifest (a new version or new text) the way the old panel redrew, except mid-typing.
  useEffect(() => {
    if (!typingIn(root)) setDraft(text);
  }, [text, version, root]);

  const gate = line.gate ?? "unknown";
  const stale = line.gate === "stale";
  const save = async () => {
    if (draft === text) { say("Không có gì thay đổi"); return; }
    if (await actions.patch([{ op: "set_line_text", id: line.id, text: draft }])) say(REDUB);
  };

  return (
    <div data-id={line.id} className="flex flex-col gap-2 rounded-md border border-border bg-panel-2 p-2.5">
      <div className="flex items-center gap-2">
        <strong className="text-sm">{`${n}. ${line.id}`}</strong>
        <span className={cn("rounded-full border px-2 text-xs font-semibold", GATE_BADGE[gate] ?? "border-border bg-background text-muted-foreground")}>{gate}</span>
      </div>
      <Textarea value={draft} disabled={!editable} aria-label={`Câu ${n}`} onChange={(e) => setDraft(e.target.value)} />
      {stale ? <p className="m-0 text-xs text-muted-foreground">{REDUB}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!editable} onClick={() => void save()}>Lưu lời</Button>
        {stale ? (
          <Button onClick={() => void actions.direct({ scope: "line", target: line.id, text: redubRequest(line.id) })}>Nhờ duyệt và lồng tiếng lại</Button>
        ) : null}
      </div>
    </div>
  );
}

export function VoiceTab() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const root = useRef<HTMLDivElement>(null);
  if (!m) return <NeedManifest />;
  if (!m.lines.length) return <Empty text="Chưa có câu thoại. Giao việc cho AI viết kịch bản." action="Giao việc cho AI" to="ai" />;
  const editable = Boolean(m.capabilities?.editable);
  return (
    <div ref={root} className="flex flex-col gap-3">
      {m.lines.map((l, i) => <LineCard key={l.id} line={l} n={i + 1} editable={editable} version={m.version} root={root} />)}
    </div>
  );
}

// The rail badge: lines whose viet-pro gate went stale (panels.js:521). Reads the cached manifest
// through the same query the shell keeps current; it never starts a request of its own.
export function useStaleCount(): number {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  return (m?.lines ?? []).filter((l) => l.gate === "stale").length;
}

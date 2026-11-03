// The notes of the director tab: every open and sent note with its time and shot, buttons to go
// there, edit, close or delete it, and one button that sends the open ones to the director as a
// single request (after asking).
import { useState } from "react";
import { queryClient, say, type SendResult } from "@/api/client.ts";
import { keys, noteRemove, notesSend, noteUpdate, useNotes } from "@/api/queries.ts";
import type { Note } from "@/api/types.ts";
import { cn } from "@/lib/utils";
import { makeConfirm } from "@/shell/confirm.tsx";
import { Button, Input } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { stamp } from "./NoteInput.tsx";
import { noteRowId, showNote } from "./NoteMarks.tsx";

const { ask, ConfirmHost } = makeConfirm();
const fail = (r: SendResult) => { if (r.status !== 200) say(r.error ?? `lỗi ${r.status}`, true); };

// Sends the open notes of the project to the director as one request, after asking (the question
// shows where <NotesList /> is mounted, in the director tab). Also the Cmd+K command.
export async function sendOpenNotes(name: string, busy?: (on: boolean) => void): Promise<void> {
  const notes = queryClient.getQueryData<{ notes: Note[] }>(keys.notes(name))?.notes ?? [];
  const ids = notes.filter((n) => n.state === "open").map((n) => n.id);
  if (!ids.length || !(await ask(`Giao ${ids.length} ghi chú cho đạo diễn?`, { ok: "Giao đạo diễn" }))) return;
  busy?.(true);
  try { fail(await notesSend({ name, ids })); } finally { busy?.(false); }
}

function Row({ name, n }: { name: string; n: Note }) {
  const [draft, setDraft] = useState<string | null>(null);
  const at = stamp(n.t);
  const save = async () => {
    const text = (draft ?? "").trim();
    setDraft(null);
    if (text && text !== n.text) fail(await noteUpdate({ name, id: n.id, text }));
  };
  return (
    <li id={noteRowId(n.id)} tabIndex={-1} data-testid="note-row" data-state={n.state} className="flex flex-col gap-1 rounded-sm border border-border px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-baseline gap-1.5 text-xs text-muted-foreground tabular-nums">
        <span aria-hidden="true" className={cn("font-bold", n.state === "open" ? "text-warn" : "text-muted-foreground")}>{n.state === "open" ? "!" : "→"}</span>
        <span>{at}</span>
        {n.shot ? <span>· {n.shot}</span> : null}
        {n.state === "sent" ? <span>· đã giao đạo diễn</span> : null}
      </div>
      {draft === null ? <p className="m-0 break-words">{n.text}</p> : (
        <Input
          autoFocus
          aria-label={`Sửa ghi chú ${at}`}
          maxLength={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void save(); }
            else if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
          }}
          onBlur={() => { void save(); }}
        />
      )}
      <div className="flex flex-wrap gap-1">
        <Button aria-label={`Tới ghi chú ${at}`} onClick={() => showNote(n)}>Tới</Button>
        <Button aria-label={`Sửa ghi chú ${at}`} onClick={() => setDraft(n.text)} disabled={draft !== null}>Sửa</Button>
        <Button aria-label={`Xong ghi chú ${at}`} onClick={async () => fail(await noteUpdate({ name, id: n.id, state: "done" }))}>Xong</Button>
        <Button aria-label={`Xoá ghi chú ${at}`} onClick={async () => fail(await noteRemove({ name, id: n.id }))}>Xoá</Button>
      </div>
    </li>
  );
}

export function NotesList() {
  const name = useStudio((s) => s.name);
  const { data } = useNotes(name);
  const [sending, setSending] = useState(false);
  if (!name || !data) return null;
  const shown = data.notes.filter((n) => n.state !== "done").sort((a, b) => a.t - b.t);
  const open = shown.filter((n) => n.state === "open");

  return (
    <section aria-labelledby="notes-title" className="flex flex-col gap-1.5" data-testid="notes-list">
      <h3 id="notes-title" className="m-0 text-sm font-semibold">{`Ghi chú (${open.length} chưa xử lý)`}</h3>
      {shown.length ? (
        <ul className="m-0 flex max-h-[min(320px,40vh)] list-none flex-col gap-1 overflow-y-auto p-0">
          {shown.map((n) => <Row key={n.id} name={name} n={n} />)}
        </ul>
      ) : <p className="m-0 text-xs text-muted-foreground">Nhấn C khi xem để ghim ghi chú tại playhead.</p>}
      {open.length ? (
        <Button variant="primary" disabled={sending} onClick={() => { void sendOpenNotes(name, setSending); }}>
          {sending ? "Đang giao…" : `Giao đạo diễn sửa ${open.length} ghi chú`}
        </Button>
      ) : null}
      <ConfirmHost />
    </section>
  );
}

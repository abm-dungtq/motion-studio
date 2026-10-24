// Port of public/panels.js; behaviour unchanged.
// The "Lời & giọng" tab (panels.js voice(), :193-211): one card per line with its text, the
// viet-pro gate badge and "Lưu lời"; a stale line also gets the reminder and a request to the
// director. A new manifest redraws the cards unless the user is typing in this tab
// (panels.js:595-601), so a half-typed line survives an outside patch.
// In a series episode (GET /api/series) each line also has its speaker, a role of the series with a
// colour of its own: changing it sends set_line_speaker (when the provider has the op, GET
// /api/voice/previews can_set_speaker) and leaves the line to voice again. A stale line is voiced
// again in its speaker's cast voice (POST /api/voice/tts, one line runs at once); "Lồng tiếng các
// câu cũ" sends every stale line, which waits on a consent card. The series extension shows the
// waiting cards and the voices to pick under this tab.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { actions } from "@/api/actions.ts";
import { api, ApiError, queryClient, say, send } from "@/api/client.ts";
import { useProject } from "@/api/queries.ts";
import type { Line } from "@/api/types.ts";
import { Button, Textarea } from "@/shell/controls.tsx";
import { Empty, NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { cn } from "@/lib/utils";

export const REDUB = "Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại";
export const NEEDS_VOICE = "Cần lồng tiếng lại";
export const redubRequest = (id: string): string => `Câu ${id} đã sửa lời: chạy cổng viet-pro cho câu này rồi lồng tiếng lại riêng câu đó.`;

const GATE_BADGE: Record<string, string> = {
  pass: "border-ok/50 bg-ok/10 text-ok",
  stale: "border-warn/50 bg-warn/10 text-warn",
};

// What a series says about the voices of this project; null when it is in no series (404).
interface SeriesVoices { roles: string[]; canSetSpeaker: boolean }
const enc = encodeURIComponent;
async function orNull<T>(path: string): Promise<T | null> {
  try { return await api<T>(path); } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
// Same query keys as the series extension, so both read one cache entry.
function useSeriesVoices(name: string | null): SeriesVoices | null {
  const series = useQuery({ queryKey: ["/api/series", name], queryFn: () => orNull<{ roles: string[] }>(`/api/series?name=${enc(name ?? "")}`), enabled: Boolean(name) });
  const voices = useQuery({ queryKey: ["/api/voice/previews", name], queryFn: () => orNull<{ can_set_speaker: boolean }>(`/api/voice/previews?name=${enc(name ?? "")}`), enabled: Boolean(name && series.data) });
  if (!series.data) return null;
  return { roles: series.data.roles ?? [], canSetSpeaker: Boolean(voices.data?.can_set_speaker) };
}

// A fixed colour per role id, one of the theme tokens picked by a hash of the id; never stored.
const SPEAKER_COLOURS = ["bg-track-voice", "bg-track-music", "bg-track-sfx", "bg-track-shot", "bg-track-broll", "bg-deco-info", "bg-deco-warn", "bg-deco-ok"];
export function speakerColour(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPEAKER_COLOURS[h % SPEAKER_COLOURS.length]!;
}
const speakerOf = (l: Line): string | null => (typeof l.speaker === "string" && l.speaker ? l.speaker : null);

// Voices lines in their speaker's cast voice. One line starts at once; more wait on a consent card.
export async function voiceLines(name: string, ids: string[]): Promise<void> {
  const r = await send("/api/voice/tts", { name, ids });
  if (r.status !== 200) { say(String(r.error ?? `Studio trả lỗi ${r.status}`), true); return; }
  void queryClient.invalidateQueries({ queryKey: ["/api/consent", name] });
  say(r.waiting_consent ? `Lồng tiếng ${ids.length} câu cần bạn đồng ý: thẻ đang chờ ở dưới và ở tab Tài sản` : `Đang lồng tiếng lại câu ${ids[0]}`);
}

function SpeakerPick({ line, n, voices, editable }: { line: Line; n: number; voices: SeriesVoices | null; editable: boolean }) {
  const speaker = speakerOf(line);
  const dot = speaker ? <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", speakerColour(speaker))} /> : null;
  if (!voices || !voices.canSetSpeaker || !editable) {
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{dot}{speaker ? `Người nói: ${speaker}` : "Chưa có người nói"}</span>;
  }
  const roles = speaker && !voices.roles.includes(speaker) ? [...voices.roles, speaker] : voices.roles;
  const change = async (next: string) => {
    if (!next || next === speaker) return;
    if (await actions.patch([{ op: "set_line_speaker", id: line.id, speaker: next }])) say(NEEDS_VOICE);
  };
  return (
    <label className="flex items-center gap-1.5 text-xs">
      {dot}
      <span className="text-muted-foreground">Người nói</span>
      <select aria-label={`Người nói câu ${n}`} value={speaker ?? ""} onChange={(e) => void change(e.target.value)}
        className="h-7 rounded-md border border-border bg-background px-1.5 text-xs">
        {speaker ? null : <option value="">Chọn người nói</option>}
        {roles.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </label>
  );
}

// The old typing(): focus is in this panel, on a textarea or a text/search input.
function typingIn(root: RefObject<HTMLElement | null>): boolean {
  const el = document.activeElement;
  return Boolean(el && root.current?.contains(el) && el.matches("textarea, input[type=text], input[type=search]"));
}

function LineCard({ name, line, n, editable, version, root, voices }: { name: string; line: Line; n: number; editable: boolean; version: number; root: RefObject<HTMLElement | null>; voices: SeriesVoices | null }) {
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
      {voices ? <SpeakerPick line={line} n={n} voices={voices} editable={editable} /> : null}
      <Textarea value={draft} disabled={!editable} aria-label={`Câu ${n}`} onChange={(e) => setDraft(e.target.value)} />
      {stale ? <p className="m-0 text-xs text-muted-foreground">{voices ? NEEDS_VOICE : REDUB}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!editable} onClick={() => void save()}>Lưu lời</Button>
        {stale && voices ? (
          <Button disabled={!speakerOf(line)} title={speakerOf(line) ? undefined : "Chọn người nói trước"} onClick={() => void voiceLines(name, [line.id])}>Lồng tiếng lại</Button>
        ) : null}
        {stale && !voices ? (
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
  const voices = useSeriesVoices(name);
  if (!m || !name) return <NeedManifest />;
  if (!m.lines.length) return <Empty text="Chưa có câu thoại. Giao việc cho AI viết kịch bản." action="Giao việc cho AI" to="ai" />;
  const editable = Boolean(m.capabilities?.editable);
  const stale = m.lines.filter((l) => l.gate === "stale").map((l) => l.id);
  return (
    <div ref={root} className="flex flex-col gap-3">
      {voices && stale.length ? (
        <Button className="self-start" onClick={() => void voiceLines(name, stale)}>{`Lồng tiếng các câu cũ (${stale.length})`}</Button>
      ) : null}
      {m.lines.map((l, i) => <LineCard key={l.id} name={name} line={l} n={i + 1} editable={editable} version={m.version} root={root} voices={voices} />)}
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

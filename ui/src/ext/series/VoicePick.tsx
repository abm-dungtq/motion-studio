// Voices waiting for the user's ear: one card "Chọn giọng cho <tên>" per role whose three Voice
// Design previews are ready (GET /api/voice/previews), each preview with a player and "Chọn giọng
// này". The click is the user's choice; Studio then locks the voice in the series cast
// (POST /api/voice/pick) and asks the director to voice that role's lines. Shown in the Tài sản
// tab, the Lời & giọng tab and the director column.
import { useState } from "react";
import { say } from "@/api/client.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { pickVoice, projectSrc, usePreviews } from "./api.ts";
import type { VoiceRolePreviews } from "./types.ts";

function PickCard({ name, role }: { name: string; role: VoiceRolePreviews }) {
  const [busy, setBusy] = useState(false);
  async function pick(n: number) {
    setBusy(true);
    const r = await pickVoice(name, role.role, n);
    setBusy(false);
    if (r.status !== 200) { say(r.error ?? "Không chọn được giọng", true); return; }
    say(`Đã chọn giọng ${n} cho ${role.name}. Đạo diễn sẽ lồng tiếng các câu của vai này.`);
  }
  return (
    <section aria-label={`Chọn giọng cho ${role.name}`} className="flex flex-col gap-2 rounded-md border border-primary/50 bg-primary/5 p-3">
      <h3 className="m-0 text-sm font-semibold">{`Chọn giọng cho ${role.name}`}</h3>
      <p className="m-0 text-xs text-muted-foreground">Nghe cả ba bản rồi chọn một. Giọng đã chọn dùng cho mọi tập của series.</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {role.previews.map((p) => (
          <li key={p.n} className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-xs font-medium">{`Giọng ${p.n}`}</span>
            <audio controls preload="none" src={projectSrc(name, p.file)} aria-label={`Nghe giọng ${p.n} của ${role.name}`} className="h-8 min-w-0 flex-1" />
            <Button disabled={busy} aria-label={`Chọn giọng ${p.n} của ${role.name}`} onClick={() => void pick(p.n)}>Chọn giọng này</Button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// The cards of one project; nothing when no role waits or the project is in no series.
export function VoicePicks({ name }: { name: string }) {
  const { data } = usePreviews(name);
  if (!data?.roles.length) return null;
  return <>{data.roles.map((r) => <PickCard key={r.role} name={name} role={r} />)}</>;
}

// For a section host: the open project's cards.
export function VoicePick() {
  const name = useStudio((s) => s.name);
  return name ? <VoicePicks name={name} /> : null;
}

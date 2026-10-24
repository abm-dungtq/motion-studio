// The "hear it again" card of the export dialog. When the sound changed after the approved animatic
// while the picture did not (a line voiced again), GET /api/gates answers audio_changed: the final
// gate only warns. "Đo tiếng" runs the provider's mix-balance (POST /api/gates/audio-check, target
// 4–7 dB of music under the voice) and shows its summary line; "Nghe rồi, được" is the user's
// confirmation (POST /api/gates/audio-review), recorded by the provider against the current sound.
// Nothing when the sound did not change.
import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, queryClient, say, send } from "@/api/client.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";

export interface AudioGate { audio_changed?: boolean }
export interface BalanceResult { level: "PASS" | "WARN" | "FAIL" | null; line: string | null; code: number | null; tail?: string[] }

const enc = encodeURIComponent;
// Under the gates key, so whatever reloads the gates reloads this card too.
const audioGateQuery = (name: string | null) => queryOptions({
  queryKey: ["/api/gates", name, "audio"] as const,
  queryFn: () => api<AudioGate>(`/api/gates?name=${enc(name ?? "")}`),
});

const CHECK_TIMEOUT_MS = 5 * 60000;

export function AudioReviewCard({ name }: { name: string }) {
  const q = useQuery(audioGateQuery(name));
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  if (!q.data?.audio_changed) return null;

  async function check() {
    setBusy(true);
    const r = await send("/api/gates/audio-check", { name }, { timeout: CHECK_TIMEOUT_MS });
    setBusy(false);
    if (r.status !== 200) { say(r.error ?? "Không đo được tiếng", true); return; }
    const b = r as unknown as BalanceResult;
    setBalance(b);
    if (!b.line) say("mix-balance không ra dòng kết quả; xem job audio-check", true);
  }

  async function review() {
    setBusy(true);
    const r = await send("/api/gates/audio-review", { name });
    setBusy(false);
    if (r.status !== 200) { say(r.error ?? "Không ghi được lần nghe lại", true); return; }
    say("Đã ghi: tiếng mới đã được nghe lại");
    await queryClient.invalidateQueries({ queryKey: ["/api/gates", name] });
  }

  const tone = balance?.level === "PASS" ? "text-ok" : balance?.level ? "text-warn" : "text-muted-foreground";
  return (
    <section aria-label="Tiếng đã đổi sau animatic" className="flex flex-col gap-2 rounded-md border border-warn/60 bg-warn/10 p-3">
      <h3 className="m-0 text-sm font-semibold">Tiếng đã đổi sau animatic</h3>
      <p className="m-0 text-xs text-muted-foreground">Hình giữ nguyên, tiếng đã khác bản animatic đã duyệt. Đo nhạc dưới giọng (đích 4–7 dB), nghe lại, rồi xác nhận.</p>
      {balance?.line ? <p className={`m-0 text-xs ${tone}`}>{balance.line}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void check()}>Đo tiếng</Button>
        <Button variant="primary" disabled={busy} onClick={() => void review()}>Nghe rồi, được</Button>
      </div>
    </section>
  );
}

// For a section host: the open project's card.
export function AudioReview() {
  const name = useStudio((s) => s.name);
  return name ? <AudioReviewCard key={name} name={name} /> : null;
}

// "Cần xử lý ngoài" cards in the director column (GET /api/handoff, routes/handoff.mjs): a step
// that failed twice in a row with the same code (a series tool, an image batch, voicing, a scene, a
// delivery step) wrote .opus/handoff/<step>.md. The card shows the text to paste into Claude Code
// in a terminal with "Chép", and "Đã xử lý" (POST /api/handoff/resolve, a resolved: line in the
// file). A resolved: line written by hand or by Claude Code closes the card too. Polled.
import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, queryClient, say, send } from "@/api/client.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { POLL_MS } from "./api.ts";

export interface Handoff { step: string; file: string; text: string; paste: string }

const enc = encodeURIComponent;
export const handoffKey = (name: string | null) => ["/api/handoff", name] as const;
const handoffQuery = (name: string | null) => queryOptions({
  queryKey: handoffKey(name),
  queryFn: async () => (await api<{ cards: Handoff[] }>(`/api/handoff?name=${enc(name ?? "")}`)).cards,
});

const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(() => say("Đã chép vào bộ nhớ tạm"), () => say("Trình duyệt không cho chép", true));

function HandoffItem({ name, card }: { name: string; card: Handoff }) {
  const [busy, setBusy] = useState(false);
  async function resolve() {
    setBusy(true);
    const r = await send("/api/handoff/resolve", { name, step: card.step });
    setBusy(false);
    if (r.status !== 200) { say(r.error ?? "Không đánh dấu được", true); return; }
    say(`Đã đánh dấu xử lý xong bước ${card.step}`);
    await queryClient.invalidateQueries({ queryKey: handoffKey(name) });
  }
  return (
    <section aria-label={`Cần xử lý ngoài: ${card.step}`} className="flex flex-col gap-2 rounded-md border border-danger/50 bg-destructive/10 p-3">
      <h3 className="m-0 text-sm font-semibold text-danger">{`Cần xử lý ngoài: ${card.step}`}</h3>
      <p className="m-0 text-xs text-muted-foreground">{`Bước này lỗi hai lần cùng mã. Dán câu dưới vào Claude Code ở terminal; chi tiết ở ${card.file}.`}</p>
      <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{card.paste}</pre>
      <div className="flex gap-2">
        <Button onClick={() => void copy(card.paste)}>Chép</Button>
        <Button variant="primary" disabled={busy} onClick={() => void resolve()}>Đã xử lý</Button>
      </div>
    </section>
  );
}

export function HandoffCards({ name }: { name: string }) {
  const { data } = useQuery({ ...handoffQuery(name), refetchInterval: POLL_MS });
  if (!data?.length) return null;
  return <>{data.map((c) => <HandoffItem key={c.step} name={name} card={c} />)}</>;
}

// For a section host: the open project's cards.
export function HandoffCard() {
  const name = useStudio((s) => s.name);
  return name ? <HandoffCards key={name} name={name} /> : null;
}

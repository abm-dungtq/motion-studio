// A step that spends turns (image drawing, voices, uploads) waits on a consent card until the user
// answers it: title, estimate, the 5-hour use of each account, and "Đồng ý" / "Không". An image
// batch also says what the estimate leaves out: every drawing is read back once to check it, and a
// drawing that fails the check is drawn and read once more (lib/assets/batch.mjs runBatch).
// POST /api/consent/answer; an answer the server refuses (busy, already answered) is said in a toast.
import { useState } from "react";
import { say } from "@/api/client.ts";
import { Button } from "@/shell/controls.tsx";
import { answerConsent } from "./api.ts";
import type { ConsentCardData, QuotaAccount } from "./types.ts";

export const accountText = (a: QuotaAccount): string =>
  a.h5 == null ? `${a.name} ${a.ok === false ? "hết lượt" : "chưa có số liệu"}` : `${a.name} còn ${Math.max(0, 100 - a.h5)}% trong 5 giờ`;

export const extraTurnsText = (images: number): string =>
  `Chưa tính: mỗi ảnh còn 1–2 lượt đọc ảnh để tự kiểm (tốn lượt codex-pool nếu agy chưa sẵn); ảnh trượt tự kiểm được vẽ lại tự động một lần. Tối đa ${images * 2} lượt vẽ và ${images * 2} lượt đọc ảnh.`;

export function ConsentCard({ name, card, onAnswered }: { name: string; card: ConsentCardData; onAnswered?: (ok: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const accounts = card.quota?.accounts ?? [];
  const turns = card.estimate?.codex_turns;
  const images = card.estimate?.images;

  async function answer(ok: boolean) {
    setBusy(true);
    const r = await answerConsent(name, card.id, ok);
    setBusy(false);
    if (r.status !== 200) { say(r.error ?? "Không gửi được câu trả lời", true); return; }
    say(ok ? "Đã đồng ý, Studio bắt đầu chạy" : "Đã bỏ qua thẻ này");
    onAnswered?.(ok);
  }

  return (
    <section aria-label="Thẻ chờ đồng ý" className="flex flex-col gap-2 rounded-md border border-warn/60 bg-warn/10 p-3">
      <h3 className="m-0 text-sm font-semibold">{card.title}</h3>
      {turns != null ? <p className="m-0 text-xs text-muted-foreground">{`Ước tính: ${turns} lượt.`}</p> : null}
      {typeof images === "number" && images > 0 ? <p className="m-0 text-xs text-muted-foreground">{extraTurnsText(images)}</p> : null}
      {accounts.length ? (
        <ul className="m-0 list-none p-0 text-xs text-muted-foreground">
          {accounts.map((a) => <li key={a.name}>{accountText(a)}</li>)}
        </ul>
      ) : null}
      {card.error ? <p className="m-0 text-xs text-warn">{`Lần trước chưa chạy được: ${card.error}`}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void answer(true)}>Đồng ý</Button>
        <Button disabled={busy} onClick={() => void answer(false)}>Không</Button>
      </div>
    </section>
  );
}

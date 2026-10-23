// Port of public/panels.js:409-479 (gateCard); behaviour unchanged. A director question waiting
// for the user (studio_ask): a choice (one button per option, with its picture when every option
// has one), an approval (the animatic or picture, its links, "Chưa được" → a reject note, "Duyệt")
// or free text. again: the question had expired, so the answer goes out as a new request carrying
// the old question and the answer. While an answer is on its way every control is disabled; a
// failed answer is said inside the card and unlocks it.
// The card is rendered with key={cardKey(…)} (Turn.tsx), so a redraw of the chat keeps the same
// DOM node and an animatic being watched does not start over.
import { useState, type ReactNode } from "react";
import { actions, type AnswerOutcome } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import type { DirectorRequest } from "@/api/types.ts";
import { isMedia } from "@/core/format.ts";
import { answerFailure } from "@/core/gate-cards.ts";
import { fileUrl } from "@/core/ui-format.ts";
import { Button, Textarea } from "@/shell/controls.tsx";
import { cn } from "@/lib/utils";
import { useDirectorMemo } from "./memo.ts";
import { Thumb } from "./Thumb.tsx";

interface AskOption { id: string; label: string }
interface Ask { question?: string; kind?: string; options?: AskOption[]; artifacts?: (string | null | undefined)[] }

// The text fields of a card keep their draft in the director memo, so a redraw or a tab switch
// does not lose it.
function Draft({ draftKey, label, placeholder, disabled }: { draftKey: string; label: string; placeholder: string; disabled: boolean }) {
  const value = useDirectorMemo((s) => s.drafts[draftKey] ?? "");
  return (
    <Textarea
      value={value}
      aria-label={label}
      placeholder={placeholder}
      maxLength={2000}
      rows={3}
      disabled={disabled}
      onChange={(e) => useDirectorMemo.getState().setDraft(draftKey, e.target.value)}
    />
  );
}

export function GateCard({ name, r, again }: { name: string; r: DirectorRequest; again: boolean }) {
  const a = (r.ask ?? {}) as Ask;
  const question = String(a.question ?? "");
  const rejecting = useDirectorMemo((s) => s.rejecting.has(r.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (value: unknown, text: string) => {
    setBusy(true);
    setErr(null);
    let res: AnswerOutcome;
    try {
      res = again
        ? await actions.reask({ scope: r.scope ?? "project", ...(r.target ? { target: r.target } : {}), text: `Trả lời lại câu hỏi "${question}": ${text}` })
        : await actions.answer(r.id, value);
    } catch (e) {
      res = { ok: false, message: answerFailure({ error: (e as Error).message }) };
    }
    if (!res.ok) {
      setErr(res.message);
      setBusy(false);
      return;
    }
    // The card stays locked until the request list replaces it.
    useDirectorMemo.getState().answered(r.id);
  };

  const draftOf = (key: string) => (useDirectorMemo.getState().drafts[key] ?? "").trim();
  const art = (a.artifacts ?? []).filter((p): p is string => Boolean(p));
  let body: ReactNode;

  if (a.kind === "choice") {
    const options = a.options ?? [];
    const imgs = art.filter((p) => isMedia(p) === "img");
    const paired = imgs.length > 0 && imgs.length === art.length && imgs.length === options.length;
    body = (
      <>
        {imgs.length && !paired ? <div className="flex flex-wrap gap-1.5">{imgs.map((p) => <Thumb key={p} name={name} path={p} />)}</div> : null}
        <div data-role="options" className={cn("gap-1.5", paired ? "grid grid-cols-2" : "flex flex-wrap")} data-pics={paired ? "true" : undefined}>
          {options.map((o, i) => (
            <Button
              key={o.id}
              disabled={busy}
              className={cn(paired && "h-auto flex-col items-stretch gap-1.5 p-1.5 whitespace-normal")}
              onClick={() => { void submit(o.id, `${o.label} (${o.id})`); }}
            >
              {paired ? <img className="w-full rounded-sm" src={fileUrl(name, imgs[i])} alt="" loading="lazy" /> : null}
              <span>{o.label}</span>
            </Button>
          ))}
        </div>
      </>
    );
  } else if (a.kind === "approve") {
    const first = art[0];
    const kind = first ? isMedia(first) : null;
    const noteKey = `${r.id}:reject`;
    body = (
      <>
        {first && kind === "video" ? <video className="w-full rounded-sm border border-border bg-stage" src={fileUrl(name, first)} controls preload="metadata" /> : null}
        {first && kind === "img" ? <img className="w-full rounded-sm border border-border bg-stage" src={fileUrl(name, first)} alt={first} /> : null}
        {first ? (
          <div className="flex flex-wrap gap-2">
            {art.map((p) => <a key={p} className="text-sm text-primary underline" href={fileUrl(name, p)} target="_blank" rel="noopener" title={p}>{p.split("/").pop()}</a>)}
          </div>
        ) : null}
        {rejecting ? <Draft draftKey={noteKey} label="Ghi chú: chưa được ở đâu" placeholder="Chỗ nào chưa được? Đạo diễn sẽ sửa theo ghi chú này." disabled={busy} /> : null}
        <div className="flex flex-wrap gap-2">
          {rejecting ? (
            <Button disabled={busy} onClick={() => { const v = draftOf(noteKey); void submit({ reject: v }, v ? `Không duyệt: ${v}` : "Không duyệt"); }}>Gửi ghi chú</Button>
          ) : (
            <Button disabled={busy} onClick={() => useDirectorMemo.getState().setRejecting(r.id, true)}>Chưa được</Button>
          )}
          <Button variant="primary" disabled={busy} onClick={() => { void submit("approve", "Duyệt"); }}>Duyệt</Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <Draft draftKey={r.id} label="Câu trả lời" placeholder="Viết câu trả lời…" disabled={busy} />
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              const v = draftOf(r.id);
              if (!v) return say("Viết câu trả lời trước", true);
              void submit(v, v);
            }}
          >Gửi</Button>
        </div>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label="Câu hỏi của đạo diễn"
      data-gate={again ? "again" : "live"}
      className="flex flex-col gap-2 rounded-md border-2 border-primary bg-panel p-3"
    >
      <small className="text-xs text-muted-foreground">{again ? "Trả lời lại câu hỏi đã hết hạn" : "Đạo diễn cần bạn trả lời"}</small>
      <strong className="text-sm">{question}</strong>
      {body}
      {err ? <p role="alert" data-role="gate-err" className="m-0 rounded-sm bg-danger px-2 py-1.5 text-sm font-semibold text-primary-foreground">{err}</p> : null}
    </div>
  );
}

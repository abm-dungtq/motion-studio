// Port of public/panels.js:386-413 (turn, liveCard); behaviour unchanged. One request as chat
// turns: the user's words on the right, the director's answer on the left. A follow-up (joined)
// request shows no user words; its trigger is the answer above it. A question waiting for the
// user is a GateCard keyed by cardKey, so React keeps the same card node across redraws.
import type { ReactNode } from "react";
import { actions } from "@/api/actions.ts";
import type { DirectorRequest } from "@/api/types.ts";
import { cardKey } from "@/core/gate-cards.ts";
import { when } from "@/core/ui-format.ts";
import { Button } from "@/shell/controls.tsx";
import { cn } from "@/lib/utils";
import { GateCard } from "./GateCard.tsx";
import { useDirectorMemo } from "./memo.ts";

const EXPIRED = /^Hết hạn chờ/;

function Me({ children }: { children: ReactNode }) {
  return <div data-bubble="me" className="flex max-w-[88%] flex-col gap-1 self-end rounded-md border border-primary/30 bg-primary/15 px-3 py-2 text-sm [overflow-wrap:anywhere]">{children}</div>;
}

function Bot({ kind = "", children }: { kind?: "" | "pending" | "err"; children: ReactNode }) {
  return (
    <div data-bubble="bot" data-state={kind || undefined} className={cn("flex max-w-[88%] flex-col gap-1 self-start rounded-md border bg-background px-3 py-2 text-sm [overflow-wrap:anywhere]", kind === "err" ? "border-danger" : "border-border")}>
      {children}
    </div>
  );
}

const Receipt = ({ text }: { text: string }) => <span className="max-h-56 overflow-auto whitespace-pre-wrap">{text}</span>;

function Cancel({ id }: { id: string }) {
  return <div className="flex gap-2"><Button onClick={() => { void actions.cancelRequest(id); }}>Huỷ yêu cầu</Button></div>;
}

export function scopeLabel(r: DirectorRequest): string {
  return `${r.scope === "project" ? "cả dự án" : `${r.scope} ${r.target ?? ""}`} · v${r.base} · ${when(r.at)}`;
}

export function Turn({ name, r, joined }: { name: string; r: DirectorRequest; joined: boolean }) {
  const reopened = useDirectorMemo((s) => s.reopen.has(r.id));
  const rejecting = useDirectorMemo((s) => s.rejecting.has(r.id));
  const card = (again: boolean) => <GateCard key={cardKey(name, r, again, rejecting)} name={name} r={r} again={again} />;
  let answer: ReactNode = null;
  if (r.status === "queued") answer = <Bot kind="pending"><span className="text-muted-foreground">Đang chờ tới lượt.</span><Cancel id={r.id} /></Bot>;
  else if (r.status === "running") answer = <Bot kind="pending"><span className="text-muted-foreground">Đang làm…</span><Cancel id={r.id} /></Bot>;
  else if (r.status === "waiting_user" && r.ask) answer = card(false);
  else if (r.status === "done" && r.ask && r.decision) {
    answer = (
      <>
        <Bot><small className="text-xs text-muted-foreground">Đạo diễn hỏi</small><span>{r.ask.question}</span></Bot>
        <Me><span>{r.decision.value}</span></Me>
      </>
    );
  } else if (r.status === "done") answer = <Bot><Receipt text={r.receipt ?? "Xong."} /></Bot>;
  else if (r.status === "failed" && r.ask && EXPIRED.test(r.error ?? "")) {
    answer = reopened ? card(true) : (
      <div data-gate="expired" className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
        <strong className="text-sm">{r.ask.question}</strong>
        <span className="text-sm text-muted-foreground">Hết hạn chờ trả lời. Trả lời lại để đạo diễn làm tiếp.</span>
        <div className="flex gap-2"><Button onClick={() => useDirectorMemo.getState().setReopen(r.id, true)}>Trả lời lại</Button></div>
      </div>
    );
  } else if (r.status === "failed") answer = <Bot kind="err"><Receipt text={r.error ?? "Không xong."} /></Bot>;
  return (
    <>
      {joined ? null : <Me><span>{r.text}</span><small className="text-xs text-muted-foreground">{scopeLabel(r)}</small></Me>}
      {answer}
    </>
  );
}

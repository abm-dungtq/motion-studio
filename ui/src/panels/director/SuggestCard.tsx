// The suggestion card above the director chat: three ranked directions, the styles that fit the
// direction picked, and the way of working (the steps it runs and the ones it skips). The data comes
// from /api/suggest (routes/suggest.mjs, ranked by lib/suggest.mjs). While the source is "observe"
// the Jev and deterministic rankings stand side by side as two equal columns and nothing is picked
// in advance, because every click is logged to compare the two sources. The server orders the
// columns from the brief hash (resp.columns), so each source stands on the left for about half the
// briefs and the log records the order the user saw. Only the user chooses:
// "Chọn và tạo pitch" posts /api/suggest/choose, and BRIEF.md is written by the provider's choose
// command, never by this card. What the provider can do (save the mode, build a pitch) is read from
// the answers, so a newer provider changes the sentences without a change here. When the provider
// suggests reference cases (CASES.md), they sit above the directions with a link and a reason each;
// a "Jev không chạy" warning in that file is shown in red, never hidden.
import { useEffect, useRef, useState } from "react";
import { queryClient } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import type { SuggestCases, SuggestChooseResult, SuggestItem, SuggestPick, SuggestRecord, SuggestResponse, SuggestSide } from "@/api/types.ts";
import { Button } from "@/shell/controls.tsx";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio.ts";

const TITLE = "Gợi ý cho dự án";
const SELECT = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";
const MAX_ITEMS = 3;

type ColumnKey = "jev" | "det";
interface Column { key: ColumnKey; side: SuggestSide }
type Notice = { kind: "ok"; text: string; extra: string | null; picks: SuggestPick[] | null } | { kind: "err"; text: string };

// Jev scores 0–4; the bar fills one cell per point. The deterministic side has no score.
function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return null;
  const filled = Math.max(0, Math.min(4, Math.round(score)));
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Điểm ${score} trên 4`}>
      {[0, 1, 2, 3].map((i) => <i key={i} className={cn("h-1.5 w-2.5 rounded-sm", i < filled ? "bg-primary" : "bg-muted")} />)}
    </span>
  );
}

function Option({ item, role, checked, onPick, disabled }: { item: SuggestItem; role: string; checked: boolean; onPick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-role={role}
      data-source={item.source}
      data-id={item.id}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "flex w-full flex-col items-stretch gap-1 rounded-md border p-2 text-left text-sm transition-colors disabled:opacity-50",
        checked ? "border-primary bg-panel-2" : "border-border bg-panel hover:bg-panel-2",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{item.label} <span className="text-xs text-muted-foreground">({item.id})</span></span>
        <ScoreBar score={item.score} />
      </span>
      <span className="text-xs whitespace-normal text-muted-foreground">{item.reason}</span>
    </button>
  );
}

const sourceLabel = (k: ColumnKey) => (k === "jev" ? "Jev" : "Tất định");
// The header chip names the card's source. While observing it names both sources evenly, so the
// header does not lean towards either column before a default source has been decided.
const sourceChip = (r: SuggestRecord) =>
  r.source === "observe" && r.jev ? "Jev và tất định, chưa chọn nguồn mặc định" : r.shown === "jev" && r.jev ? "Jev" : "Tất định";

function chooseNotice(d: SuggestChooseResult): Notice {
  const extra = d.mode && d.mode.saved === false && d.mode.reason ? d.mode.reason : null;
  if (d.outcome === "chosen") {
    const text = d.initialized
      ? `Đã tạo pitch với hướng ${d.direction} đứng đầu và chọn hướng này. BRIEF.md đã được cập nhật.`
      : `Đã chọn hướng ${d.direction} với style ${d.style ?? "mặc định của hướng"}. BRIEF.md đã được cập nhật.`;
    const kept = d.requested_style
      ? `Bạn chọn style ${d.requested_style}, nhưng lệnh chọn hướng của plugin giữ style ${d.style ?? "mặc định"} trong BRIEF.md.`
      : null;
    return { kind: "ok", text, extra: [kept, extra].filter(Boolean).join(" ") || null, picks: null };
  }
  if (d.outcome === "not_in_pitch") {
    return { kind: "ok", text: "Pitch hiện có không gồm hướng này. Chọn một trong các hướng đã có trong pitch bên dưới.", extra, picks: d.picks ?? [] };
  }
  return { kind: "ok", text: "Dự án chưa có pitch. Đã nhờ đạo diễn tạo pitch trước. Khi pitch xong, bạn bấm chọn lại trên thẻ này.", extra, picks: null };
}

function Cases({ cases, stale }: { cases: SuggestCases; stale: boolean }) {
  return (
    <div className="flex flex-col gap-1.5" data-role="suggest-cases">
      <b className="text-xs font-medium text-muted-foreground">Case mẫu từ thư viện</b>
      {stale ? <p role="status" data-role="suggest-cases-stale" className="m-0 text-xs font-semibold">Brief đã đổi sau lần gợi ý case này. Bấm Gợi ý lại để xếp hạng case theo brief mới.</p> : null}
      {cases.warning ? <p role="alert" data-role="suggest-cases-warning" className="m-0 rounded-sm bg-danger px-2 py-1.5 text-xs font-semibold text-primary-foreground">{cases.warning}</p> : null}
      {cases.notes.map((n) => <p key={n} className="m-0 text-xs text-muted-foreground">{n}</p>)}
      {cases.items.length ? cases.items.map((c) => (
        <div key={c.id} data-role="suggest-case" data-id={c.id} className="flex flex-col gap-0.5 rounded-md border border-border bg-panel p-2 text-sm">
          <span className="font-semibold">
            {c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener" className="underline">{c.id}</a> : c.id}
            <span className="text-xs font-normal text-muted-foreground">{` · @${c.author} · ${c.category}`}</span>
          </span>
          <span className="text-xs whitespace-normal">{c.summary}</span>
          {c.why ? <span className="text-xs whitespace-normal text-muted-foreground">{`Vì sao: ${c.why}`}</span> : null}
          {c.demo && c.demo !== c.url ? <a href={c.demo} target="_blank" rel="noreferrer noopener" data-role="suggest-case-demo" className="text-xs underline">Xem video demo</a> : null}
        </div>
      )) : <pre className="m-0 text-xs whitespace-pre-wrap">{cases.text}</pre>}
      {cases.items.length ? <p className="m-0 text-xs text-muted-foreground">Muốn làm theo một case? Nhắn đạo diễn, ví dụ "theo case 2": đạo diễn viết prompt chuyển thể cho video này, giải thích vì sao và gửi lại link video demo.</p> : null}
    </div>
  );
}

// The card's choices for one stored record; keyed by the record, so a new ranking starts afresh.
function Choices({ name, resp, record }: { name: string; resp: SuggestResponse; record: SuggestRecord }) {
  const observe = record.source === "observe" && record.jev !== null;
  const single: SuggestSide = record.shown === "jev" && record.jev ? record.jev : record.det;
  const order: ColumnKey[] = resp.columns?.length ? resp.columns : [single === record.det ? "det" : "jev"];
  const columns: Column[] = order.flatMap((key): Column[] => {
    const side = key === "jev" ? record.jev : record.det;
    return side ? [{ key, side }] : [];
  });

  const [dirSel, setDirSel] = useState<string | null>(observe ? null : (single.directions[0]?.id ?? null));
  const [styleOverride, setStyleOverride] = useState<string | null>(null);
  const [modeOverride, setModeOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Style and mode follow the column holding the direction; the left one when both hold it.
  const active: SuggestSide | null = dirSel === null ? null
    : observe ? (columns.find((c) => c.side.directions.some((x) => x.id === dirSel))?.side ?? record.det)
    : single;
  const styles = (active?.styles ?? []).filter((s) => s.directions?.includes(dirSel ?? "") ?? true).slice(0, MAX_ITEMS);
  const styleSel = dirSel === null ? null : (styles.find((s) => s.id === styleOverride)?.id ?? styles[0]?.id ?? null);
  const modeSel = modeOverride ?? (active ?? record.det).workflow.mode;
  const workflow = [active, record.jev, record.det].find((s) => s?.workflow.mode === modeSel)?.workflow ?? null;

  const pickDirection = (id: string) => { setDirSel(id); setStyleOverride(null); };

  const choose = async () => {
    if (!dirSel) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await Q.suggestChoose({ name, direction: dirSel, style: styleSel ?? undefined, mode: modeSel });
      if (r.status !== 200 || !r.data) setNotice({ kind: "err", text: `Chưa chọn được: ${r.error ?? `HTTP ${r.status}`}` });
      else setNotice(chooseNotice(r.data));
    } catch (e) {
      setNotice({ kind: "err", text: `Chưa chọn được: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const rank1 = (s: SuggestSide | null) => s?.directions[0] ?? null;
  const detTop = rank1(record.det);
  const jevTop = rank1(record.jev);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <b className="text-xs font-medium text-muted-foreground">Hướng</b>
        <div data-role={observe ? "suggest-columns" : undefined} className={cn("gap-2", observe ? "grid grid-cols-2" : "flex flex-col")}>
          {columns.map((c) => (
            <div key={c.key} role="radiogroup" aria-label={`Hướng theo ${sourceLabel(c.key)}`} className="flex min-w-0 flex-col gap-1.5">
              {observe ? <strong className="text-xs">{sourceLabel(c.key)}</strong> : null}
              {c.side.directions.slice(0, MAX_ITEMS).map((d) => (
                <Option key={d.id} item={d} role="suggest-direction" checked={d.id === dirSel} disabled={busy} onPick={() => pickDirection(d.id)} />
              ))}
            </div>
          ))}
        </div>
        {observe && detTop && jevTop ? (
          <p className="m-0 text-xs text-muted-foreground" data-role="suggest-compare">
            {`Gợi ý tất định: ${detTop.label}. ${detTop.id === jevTop.id ? "Trùng" : "Khác"} với Jev ở hạng 1.`}
          </p>
        ) : null}
      </div>

      {dirSel !== null ? (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Style">
          <b className="text-xs font-medium text-muted-foreground">Style</b>
          {styles.length ? styles.map((s) => (
            <Option key={s.id} item={s} role="suggest-style" checked={s.id === styleSel} disabled={busy} onPick={() => setStyleOverride(s.id)} />
          )) : <p className="m-0 text-xs text-muted-foreground">Chưa có style hợp với hướng này. Lệnh chọn hướng sẽ dùng style mặc định của hướng.</p>}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5" data-role="suggest-workflow">
        <b className="text-xs font-medium text-muted-foreground">Quy trình</b>
        <select className={SELECT} aria-label="Chế độ vận hành" value={modeSel} disabled={busy} onChange={(e) => setModeOverride(e.target.value)}>
          {resp.modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          {resp.modes.some((m) => m.id === modeSel) ? null : <option value={modeSel}>{modeSel}</option>}
        </select>
        {resp.can_save_mode ? null : <p className="m-0 text-xs text-muted-foreground">Chế độ này đi kèm lời yêu cầu gửi đạo diễn, chưa lưu vào project.json.</p>}
        {workflow ? (
          <>
            {workflow.steps.length ? <p className="m-0 text-xs" data-role="suggest-steps">{workflow.steps.join(" → ")}</p> : null}
            {workflow.skip.map((s) => <p key={s.step} className="m-0 text-xs text-muted-foreground">{`Bỏ qua: ${s.step} (${s.reason})`}</p>)}
            <p className="m-0 text-xs text-muted-foreground">{workflow.reason}</p>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Button variant="primary" data-role="suggest-choose" disabled={busy || dirSel === null} onClick={() => { void choose(); }}>Chọn và tạo pitch</Button>
        {observe && dirSel === null ? <p className="m-0 text-xs text-muted-foreground">Chọn một hướng ở một trong hai cột để tiếp tục.</p> : null}
        {!resp.can_init_pitch && resp.picks === null ? <p className="m-0 text-xs text-muted-foreground">Dự án chưa có pitch, nên bấm chọn sẽ nhờ đạo diễn tạo pitch trước.</p> : null}
      </div>

      {notice?.kind === "err" ? <p role="alert" data-role="suggest-err" className="m-0 rounded-sm bg-danger px-2 py-1.5 text-sm font-semibold text-primary-foreground">{notice.text}</p> : null}
      {notice?.kind === "ok" ? (
        <div role="status" data-role="suggest-result" className="flex flex-col gap-1.5 text-sm">
          <p className="m-0">{notice.text}</p>
          {notice.extra ? <p className="m-0 text-xs text-muted-foreground">{notice.extra}</p> : null}
          {notice.picks ? (
            <div className="flex flex-wrap gap-1.5" data-role="suggest-picks">
              {notice.picks.map((p) => (
                <Button key={p.n} aria-pressed={p.id === dirSel} disabled={busy} onClick={() => pickDirection(p.id)}>{p.id}</Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Card({ name }: { name: string }) {
  const suggest = Q.useSuggest(name);
  const requests = Q.useRequests(name);
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);

  // A finished director task may have built the pitch: read the suggestion again.
  const done = (requests.data ?? []).filter((r) => r.status === "done").length;
  const lastDone = useRef(done);
  useEffect(() => {
    if (done > lastDone.current) void queryClient.invalidateQueries({ queryKey: Q.keys.suggest(name) });
    lastDone.current = done;
  }, [done, name]);

  const resp = suggest.data;
  const record = resp?.record ?? null;

  const run = async () => {
    setRunning(true);
    setRunErr(null);
    try {
      const r = await Q.suggestRun({ name, refresh: Boolean(record) });
      if (r.status !== 200) setRunErr(`Chưa gợi ý được: ${r.error ?? `HTTP ${r.status}`}`);
      else if (r.data?.cases_error) setRunErr(r.data.cases_error);
    } catch (e) {
      setRunErr(`Chưa gợi ý được: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section data-role="suggest-card" aria-label={TITLE} className="flex flex-col gap-2 rounded-md border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2" data-role="suggest-header">
        <strong className="text-sm whitespace-nowrap">{TITLE}</strong>
        {record ? (
          <span data-role="suggest-source" className="min-w-0 rounded-sm bg-panel-2 px-1.5 py-0.5 text-xs text-muted-foreground">
            {sourceChip(record)}
          </span>
        ) : null}
        <Button className="ml-auto shrink-0 whitespace-nowrap" data-role="suggest-run" disabled={running || !resp} onClick={() => { void run(); }}>{record ? "Gợi ý lại" : "Gợi ý"}</Button>
      </div>
      {suggest.error ? <p role="alert" className="m-0 text-sm text-muted-foreground">{`Chưa đọc được gợi ý: ${suggest.error.message}`}</p> : null}
      {runErr ? <p role="alert" data-role="suggest-run-err" className="m-0 rounded-sm bg-danger px-2 py-1.5 text-sm font-semibold text-primary-foreground">{runErr}</p> : null}
      {record?.error ? <p role="status" className="m-0 text-xs text-muted-foreground">{record.error.message}</p> : null}
      {resp?.cases ? <Cases cases={resp.cases} stale={Boolean(resp.cases_stale)} /> : null}
      {resp && !record ? <p className="m-0 text-sm text-muted-foreground">{`Chưa có gợi ý. Bấm Gợi ý để xếp hạng hướng, style và quy trình${resp.can_suggest_cases && !resp.cases ? ", và tìm case mẫu trong thư viện" : ""} cho dự án này.`}</p> : null}
      {resp && record ? <Choices key={`${record.hash}:${record.at}`} name={name} resp={resp} record={record} /> : null}
    </section>
  );
}

export function SuggestCard() {
  const name = useStudio((s) => s.name);
  return name ? <Card name={name} /> : null;
}

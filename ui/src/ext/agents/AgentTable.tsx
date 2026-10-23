// Port of public/ext-agents.js; behaviour unchanged. The agent CLI table in the agent dialog
// (GET /api/agents): CLI, version, login, what it can do (text, vision, image), codex-pool quota
// and the routing order. "Làm mới" rescans; "Thử khả năng" starts one real run of a cap on one
// agent (it spends that agent's quota, so only this click starts it) and follows the job until it
// ends. Only status is shown: the server never sends emails, organisations or tokens, and this
// table reads none of the other fields an agent entry may carry, login method included.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/api/client.ts";
import { agentsProbe, agentsQuery, agentsRefresh, keys } from "@/api/queries.ts";
import type { AgentCli, AgentsScan } from "@/api/types.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AgentRowProps } from "@/ext/registry.ts";
import { poolLines, type PoolQuota } from "@/core/pool-lines.ts";
import { cn } from "@/lib/utils";
import { Button } from "@/shell/controls.tsx";

export const CAP: Record<string, string> = { text: "Chữ", vision: "Đọc ảnh", image: "Sinh ảnh" };
const CAPS = Object.keys(CAP);
const SAY: Record<string, string> = { yes: "có", no: "không", unknown: "chưa rõ" };
const COLOR: Record<string, string> = { yes: "text-ok", no: "text-muted-foreground", unknown: "text-warn" };
export const POLL_MS = 1500;
export const PROBE_MAX_MS = 6 * 60000;
export const AGENT_ROWS_WIDTH = "min(640px, calc(100vw - 16px))";

// The last probe job (jobs.mjs view()) as this table reads it.
interface Probe { status?: string; code?: number | null; started?: string; tail?: string[]; meta?: { agent?: string; cap?: string } | null }
const probeOf = (scan: AgentsScan | undefined): Probe | null => (scan?.probe && typeof scan.probe === "object" ? (scan.probe as Probe) : null);
const running = (p: Probe | null): boolean => p?.status === "running" || p?.status === "cancelling";
const verifiedOf = (a: AgentCli, c: string): { ok?: boolean } | null => {
  const v = (a.verified as Record<string, { ok?: boolean }> | undefined)?.[c];
  return v && typeof v === "object" ? v : null;
};

const login = (a: AgentCli): string => (a.detect_only && a.logged_in == null ? "—" : a.logged_in === true ? "có" : a.logged_in === false ? "chưa" : "chưa rõ");
const shortVersion = (a: AgentCli): string | null => (a.error ? null : a.version ? ` ${a.version.replace(new RegExp(`^${a.id}[ /]`, "i"), "").replace(/\s*[([].*$/, "")}` : "");

// Poll while the last probe runs, for at most PROBE_MAX_MS after it started.
export function probeInterval(scan: AgentsScan | undefined, now = Date.now()): number | false {
  const p = probeOf(scan);
  if (!running(p)) return false;
  if (now - Date.parse(p?.started ?? String(new Date(now).toISOString())) > PROBE_MAX_MS) return false;
  return POLL_MS;
}

function Bad({ children }: { children: string }) { return <span className="text-danger">{children}</span>; }

const TH = "px-1.5 py-0.5 text-left font-semibold whitespace-nowrap";
const TD = "px-1.5 py-0.5 align-top";

function Table({ scan }: { scan: AgentsScan }) {
  const runs = scan.agents.filter((a) => a.found && !a.detect_only);
  const seen = scan.agents.filter((a) => a.found && a.detect_only);
  const missing = scan.agents.filter((a) => !a.found).map((a) => a.label);
  return (
    <>
      <table className="w-full border-collapse text-xs">
        <thead><tr><th className={TH}>CLI</th><th className={TH}>Phiên bản</th><th className={TH}>Đăng nhập</th>{CAPS.map((c) => <th key={c} className={TH}>{CAP[c]}</th>)}</tr></thead>
        <tbody>
          {runs.flatMap((a) => {
            const q = poolLines(a.quota as PoolQuota | undefined);
            const row = (
              <tr key={a.id} title={a.error ? `Lỗi: ${a.error}` : ""}>
                <td className={cn(TD, "whitespace-nowrap")}>{a.label}</td>
                <td className={TD}>{a.error ? <Bad>lỗi</Bad> : (a.version ?? "—")}</td>
                <td className={TD}>{login(a)}</td>
                {CAPS.map((c) => {
                  const v = a.caps?.[c] ?? "unknown";
                  const proved = verifiedOf(a, c);
                  return <td key={c} className={cn(TD, "whitespace-nowrap", COLOR[v])} title={proved ? `Đã thử: ${proved.ok ? "được" : "không được"}` : ""}>{`${SAY[v] ?? v}${proved ? " ✓" : ""}`}</td>;
                })}
              </tr>
            );
            // Quota under its CLI, across the row, so the table keeps the dialog's width.
            return q.length ? [row, <tr key={`${a.id}-quota`}><td colSpan={6} className="px-1.5 pb-1 pl-[18px] text-muted-foreground">{`Quota: ${q.join(" · ")}`}</td></tr>] : [row];
          })}
        </tbody>
      </table>
      {seen.length ? (
        <p className="m-0 mt-1.5 text-xs text-muted-foreground" title="Studio chỉ đọc phiên bản, không chạy các CLI này">
          {"Chỉ dò thấy: "}
          {seen.map((a, i) => (
            <span key={a.id}>{i ? ", " : null}{a.error ? <span title={`Lỗi: ${a.error}`}>{a.label} (<Bad>lỗi</Bad>)</span> : `${a.label}${shortVersion(a)}`}</span>
          ))}
        </p>
      ) : null}
      {missing.length ? <p className="m-0 mt-1.5 text-xs text-muted-foreground">{`Không thấy: ${missing.join(", ")}`}</p> : null}
    </>
  );
}

function OrderLine({ order }: { order?: Record<string, string[]> }) {
  if (!order) return null;
  return (
    <div className="mt-1.5 text-xs">
      {CAPS.filter((c) => order[c]?.length).map((c) => <div key={c} className="text-muted-foreground">{`${CAP[c]}: ${order[c].join(" → ")}`}</div>)}
    </div>
  );
}

function ProbeLine({ probe: p }: { probe: Probe | null }) {
  if (!p) return null;
  const cap = p.meta?.cap;
  const who = `${p.meta?.agent ?? "?"} · ${(cap && CAP[cap]) ?? cap ?? "?"}`;
  if (running(p)) return <p className="m-0 text-xs text-muted-foreground">{`Đang thử ${who}…`}</p>;
  const tail = p.tail ?? [];
  const last = [...tail].reverse().find((l) => /^(OK|FAIL)(\s|$)/.test(l)) ?? tail.at(-1) ?? "";
  const ok = p.code === 0 && last.startsWith("OK");
  return (
    <p className={cn("m-0 text-xs", ok ? "text-muted-foreground" : "text-danger")} title={tail.slice(-6).join("\n")}>
      {`Lần thử gần nhất (${who}): ${ok ? "được" : "không được"}${last ? `, ${last.replace(/^(OK|FAIL)\s*/, "")}` : ""}`}
    </p>
  );
}

export function AgentTable(_props: AgentRowProps) {
  const { data: scan, error: readError, refetch } = useQuery({ ...agentsQuery(), staleTime: Infinity, refetchInterval: (q) => probeInterval(q.state.data) });
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pickId, setPickId] = useState<string | null>(null);
  const [cap, setCap] = useState("image");

  const error = refreshError ?? readError?.message ?? null;
  const runnable = scan?.agents?.filter((a) => a.found && !a.error && !a.detect_only) ?? [];
  const id = runnable.some((a) => a.id === pickId) ? pickId : runnable[0]?.id ?? null;
  const probe = probeOf(scan);
  const probing = running(probe);

  async function refresh() {
    setNote(null);
    const r = await agentsRefresh();
    if (r.status !== 200) { setRefreshError(r.error ?? `Lỗi ${r.status}`); return; }
    setRefreshError(null);
    if (r.data && Array.isArray((r.data as AgentsScan).agents)) queryClient.setQueryData(keys.agents(), r.data as AgentsScan);
  }

  async function startProbe() {
    if (!id || busy) return;
    setBusy(true); setNote(null);
    const r = await agentsProbe({ id, cap });
    setBusy(false);
    if (r.status !== 200) setNote(r.error ?? `Lỗi ${r.status}`);
    await refetch();
  }

  const head = <h3 className="m-0 mt-3 text-sm font-semibold">Agent CLI</h3>;
  // Controls need a scan: an error without one shows the error only.
  const controls = scan ? (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Button onClick={() => { void refresh(); }}>Làm mới</Button>
      <Select value={id ?? undefined} onValueChange={setPickId}>
        <SelectTrigger size="sm" aria-label="Agent để thử"><SelectValue /></SelectTrigger>
        <SelectContent>{runnable.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={cap} onValueChange={setCap}>
        <SelectTrigger size="sm" aria-label="Khả năng để thử"><SelectValue /></SelectTrigger>
        <SelectContent>{CAPS.map((c) => <SelectItem key={c} value={c}>{CAP[c]}</SelectItem>)}</SelectContent>
      </Select>
      <Button disabled={busy || probing || !id} title="Chạy thật một lần, có tốn quota của agent này" onClick={() => { void startProbe(); }}>{probing ? "Đang thử…" : "Thử khả năng"}</Button>
    </div>
  ) : null;

  if (error) return <div data-agent-rows="cli">{head}<p className="m-0 text-sm text-danger">{`Không đọc được danh sách agent: ${error}`}</p>{controls}</div>;
  if (!scan) return <div data-agent-rows="cli">{head}<p className="m-0 text-sm text-muted-foreground">Đang quét các CLI…</p></div>;
  return (
    <div data-agent-rows="cli" className="flex flex-col gap-1">
      {head}
      <Table scan={scan} />
      <OrderLine order={scan.order} />
      {controls}
      {note ? <p className="m-0 text-sm text-danger">{note}</p> : null}
      <ProbeLine probe={probe} />
      <p className="m-0 mt-1 text-[11px] text-muted-foreground">{`Quét lúc ${scan.at ? new Date(scan.at).toLocaleTimeString("vi-VN") : "?"}. "Thử khả năng" chạy thật một lần và tốn quota.`}</p>
    </div>
  );
}

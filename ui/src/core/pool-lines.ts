// Port of poolLines from public/ext-agents.js (commit 22e7611); logic unchanged.
// The codex-pool quota lines of the agent CLI table in the agent chip's popover (GET /api/agents).
export interface PoolAccount { name: string; ok?: boolean; h5?: number | null; week?: number | null }
export interface PoolQuota { accounts?: PoolAccount[] | null; next?: string | null }

const pct = (n: number | null | undefined): string | null => (n == null ? null : `${Math.round(n)}%`);

// "acct1 5h 38% · tuần 12%" per account, then "kế tiếp: acct2".
export function poolLines(quota: PoolQuota | null | undefined): string[] {
  if (!Array.isArray(quota?.accounts)) return [];
  const lines = quota.accounts.map((x) => {
    const use = [pct(x.h5) && `5h ${pct(x.h5)}`, pct(x.week) && `tuần ${pct(x.week)}`].filter(Boolean).join(" · ");
    return `${x.name} ${use || (x.ok ? "chưa dùng" : "")}${x.ok ? "" : " · hết lượt"}`.trim();
  });
  if (quota.next) lines.push(`kế tiếp: ${quota.next}`);
  return lines;
}

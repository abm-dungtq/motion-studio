// public/ext-agents.js — the agent CLI table in the agent chip's popover (GET /api/agents):
// CLI, version, login, what it can do (text, vision, image), codex-pool quota and the routing
// order; "Làm mới" rescans, "Thử khả năng" starts one real run of a cap on one agent (it spends
// that agent's quota, so only this click starts it) and follows the job until it ends.
// Only status is shown: the server never sends emails, organisations or tokens, and this file
// shows no login method either.
const CAP = { text: "Chữ", vision: "Đọc ảnh", image: "Sinh ảnh" };
const CAPS = Object.keys(CAP);
const SAY = { yes: "có", no: "không", unknown: "chưa rõ" };
const COLOR = { yes: "var(--ok, #3fb950)", no: "var(--muted, #8b949e)", unknown: "var(--warn, #d29922)" };
const POLL_MS = 1500;
const PROBE_MAX_MS = 6 * 60000;

// h() takes style as an object; these rows are written as CSS text.
const st = (css) => Object.fromEntries(String(css).split(";").map((x) => x.split(/:(.*)/s).map((y) => y.trim())).filter(([k, v]) => k && v));
const login = (a) => (a.detect_only && a.logged_in == null ? "—" : a.logged_in === true ? "có" : a.logged_in === false ? "chưa" : "chưa rõ");
const pct = (n) => (n == null ? null : `${Math.round(n)}%`);

// "acct1 5h 38% · tuần 12%" per account, then "kế tiếp: acct2".
export function poolLines(quota) {
  if (!Array.isArray(quota?.accounts)) return [];
  const lines = quota.accounts.map((x) => {
    const use = [pct(x.h5) && `5h ${pct(x.h5)}`, pct(x.week) && `tuần ${pct(x.week)}`].filter(Boolean).join(" · ");
    return `${x.name} ${use || (x.ok ? "chưa dùng" : "")}${x.ok ? "" : " · hết lượt"}`.trim();
  });
  if (quota.next) lines.push(`kế tiếp: ${quota.next}`);
  return lines;
}

export function register(studio) {
  const { ctx } = studio;
  let scan = null, error = null, busy = false, note = null, reloadChip = null, pollTimer = null;
  const pick = { id: null, cap: "image" };

  const repaint = () => reloadChip?.();
  async function fetchScan(refresh = false) {
    try {
      if (refresh) {
        const r = await ctx.send("/api/agents/refresh", {});
        if (r.status !== 200) throw new Error(r.error ?? `Lỗi ${r.status}`);
        scan = r;
      } else scan = await ctx.api("/api/agents");
      error = null;
    } catch (e) { error = e.message; }
    followProbe();
    repaint();
  }

  // While the last probe job runs, poll GET /api/agents; its end rescans (the server drops the cache).
  function followProbe() {
    clearTimeout(pollTimer);
    const p = scan?.probe;
    if (!p || (p.status !== "running" && p.status !== "cancelling")) return;
    if (Date.now() - Date.parse(p.started ?? Date.now()) > PROBE_MAX_MS) return;
    pollTimer = setTimeout(() => fetchScan(false), POLL_MS);
  }

  async function startProbe() {
    if (!pick.id || busy) return;
    busy = true; note = null; repaint();
    const r = await ctx.send("/api/agents/probe", { id: pick.id, cap: pick.cap });
    busy = false;
    if (r.status !== 200) note = { bad: true, text: r.error ?? `Lỗi ${r.status}` };
    await fetchScan(false);
  }

  function probeLine(h) {
    const p = scan?.probe;
    if (!p) return null;
    const who = `${p.meta?.agent ?? "?"} · ${CAP[p.meta?.cap] ?? p.meta?.cap ?? "?"}`;
    if (p.status === "running" || p.status === "cancelling") return h("p", { class: "note" }, `Đang thử ${who}…`);
    const last = [...(p.tail ?? [])].reverse().find((l) => /^(OK|FAIL)(\s|$)/.test(l)) ?? (p.tail ?? []).at(-1) ?? "";
    const ok = p.code === 0 && last.startsWith("OK");
    return h("p", { class: ok ? "note" : "form-error", title: (p.tail ?? []).slice(-6).join("\n") }, `Lần thử gần nhất (${who}): ${ok ? "được" : "không được"}${last ? `, ${last.replace(/^(OK|FAIL)\s*/, "")}` : ""}`);
  }

  function table(h) {
    const runs = scan.agents.filter((a) => a.found && !a.detect_only);
    const seen = scan.agents.filter((a) => a.found && a.detect_only);
    const missing = scan.agents.filter((a) => !a.found).map((a) => a.label);
    const small = st("font-size:12px;margin:6px 0 0");
    const bad = (t) => h("span", { style: st("color:var(--danger, #cf222e)") }, t);
    const th = (t) => h("th", { style: st("text-align:left;font-weight:600;padding:2px 6px;white-space:nowrap") }, t);
    const td = (v, style = "") => h("td", { style: st(`padding:2px 6px;vertical-align:top;${style}`) }, v);
    const cap = (a, c) => {
      const v = a.caps?.[c] ?? "unknown";
      const proved = a.verified?.[c];
      return h("td", { style: st(`padding:2px 6px;vertical-align:top;white-space:nowrap;color:${COLOR[v] ?? "inherit"}`), title: proved ? `Đã thử: ${proved.ok ? "được" : "không được"}` : "" }, `${SAY[v] ?? v}${proved ? " ✓" : ""}`);
    };
    const rows = runs.flatMap((a) => {
      const row = h("tr", { title: a.error ? `Lỗi: ${a.error}` : "" },
        td(a.label, "white-space:nowrap"),
        td(a.error ? bad("lỗi") : (a.version ?? "—")),
        td(login(a)),
        ...CAPS.map((c) => cap(a, c)));
      const q = poolLines(a.quota);
      // Quota under its CLI, across the row, so the table keeps the popover's width.
      return q.length ? [row, h("tr", {}, h("td", { colspan: 6, style: st("padding:0 6px 4px 18px;color:var(--muted, #8b949e)") }, `Quota: ${q.join(" · ")}`))] : [row];
    });
    const version = (a) => (a.error ? null : a.version ? ` ${a.version.replace(new RegExp(`^${a.id}[ /]`, "i"), "").replace(/\s*[([].*$/, "")}` : "");
    return [
      h("table", { style: st("border-collapse:collapse;width:100%;font-size:12px") },
        h("thead", {}, h("tr", {}, th("CLI"), th("Phiên bản"), th("Đăng nhập"), ...CAPS.map((c) => th(CAP[c])))),
        h("tbody", {}, ...rows)),
      seen.length ? h("p", { class: "muted", style: small, title: "Studio chỉ đọc phiên bản, không chạy các CLI này" },
        "Chỉ dò thấy: ", ...seen.flatMap((a, i) => [i ? ", " : null, a.error ? h("span", { title: `Lỗi: ${a.error}` }, a.label, " (", bad("lỗi"), ")") : `${a.label}${version(a)}`])) : null,
      missing.length ? h("p", { class: "muted", style: small }, `Không thấy: ${missing.join(", ")}`) : null,
    ];
  }

  function orderLine(h) {
    const o = scan?.order;
    if (!o) return null;
    return h("div", { style: st("font-size:12px;margin-top:6px") }, ...CAPS.filter((c) => o[c]?.length).map((c) => h("div", { class: "muted" }, `${CAP[c]}: ${o[c].join(" → ")}`)));
  }

  function controls(h) {
    const runnable = scan.agents.filter((a) => a.found && !a.error && !a.detect_only);
    if (!runnable.some((a) => a.id === pick.id)) pick.id = runnable[0]?.id ?? null;
    const running = ["running", "cancelling"].includes(scan.probe?.status);
    const agentSel = h("select", { "aria-label": "Agent để thử", onchange: (e) => { pick.id = e.target.value; } },
      ...runnable.map((a) => h("option", { value: a.id, selected: a.id === pick.id }, a.label)));
    const capSel = h("select", { "aria-label": "Khả năng để thử", onchange: (e) => { pick.cap = e.target.value; } },
      ...CAPS.map((c) => h("option", { value: c, selected: c === pick.cap }, CAP[c])));
    return h("div", { style: st("display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px") },
      h("button", { class: "btn", type: "button", onclick: () => { note = null; fetchScan(true); } }, "Làm mới"),
      agentSel, capSel,
      h("button", { class: "btn", type: "button", disabled: busy || running || !pick.id, title: "Chạy thật một lần, có tốn quota của agent này", onclick: startProbe }, running ? "Đang thử…" : "Thử khả năng"));
  }

  studio.addAgentRows((_data, { reload, h }) => {
    reloadChip = reload;
    const head = h("h3", { style: st("margin-top:12px") }, "Agent CLI");
    if (error) return [head, h("p", { class: "form-error" }, `Không đọc được danh sách agent: ${error}`), controls(h)];
    if (!scan) return [head, h("p", { class: "muted" }, "Đang quét các CLI…")];
    return [
      head,
      ...table(h),
      orderLine(h),
      controls(h),
      note ? h("p", { class: note.bad ? "form-error" : "note" }, note.text) : null,
      probeLine(h),
      h("p", { class: "muted", style: st("font-size:11px;margin:4px 0 0") }, `Quét lúc ${scan.at ? new Date(scan.at).toLocaleTimeString("vi-VN") : "?"}. "Thử khả năng" chạy thật một lần và tốn quota.`),
    ].filter(Boolean);
  }, { width: "min(640px, calc(100vw - 16px))" });

  fetchScan(false);
}

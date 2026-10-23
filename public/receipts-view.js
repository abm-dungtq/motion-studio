// public/receipts-view.js — the receipt list and detail views used by ext-receipts.js, and a small
// per-project cache of GET /api/receipts, so redraws of a panel or the inspector do not refetch.
// Text goes in through h() as text nodes only (receipt fields come from files of the project).
export const VERDICT = { pass: "đạt", warn: "cảnh báo", fail: "trượt" };
const FRESH_MS = 5000;

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "?" : d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

export const verdictBadge = (h, v) => h("span", { class: `badge rc-${v ?? "fail"}`, title: `verdict ${v}` }, VERDICT[v] ?? String(v));

// get(name) → { rows, error, at } | null (cached); load(name, force) refetches when stale and
// resolves when the data is there (at once when fresh).
export function receiptsStore(ctx, onChange) {
  const by = new Map(); // name → { rows, error, at, pending: Promise | null }
  function load(name, force = false) {
    if (!name) return Promise.resolve();
    const cur = by.get(name);
    if (cur?.pending) return cur.pending;
    if (!force && cur && Date.now() - cur.at < FRESH_MS) return Promise.resolve();
    const pending = (async () => {
      let next;
      try { next = { rows: (await ctx.api(`/api/receipts?name=${encodeURIComponent(name)}&limit=20`)).receipts ?? [], error: null }; } catch (e) { next = { rows: cur?.rows ?? [], error: e.message }; }
      by.set(name, { ...next, at: Date.now(), pending: null });
      onChange?.(name);
    })();
    by.set(name, { rows: cur?.rows ?? [], error: cur?.error ?? null, at: cur?.at ?? 0, pending });
    return pending;
  }
  return { get: (name) => by.get(name) ?? null, load };
}

// One row per receipt: verdict, op, actor, time, output files; onOpen(id) shows its detail.
export function receiptRows(h, rows, { open = null, detail = null, onOpen }) {
  return rows.map((r) => {
    const head = h("button", { class: "rc-row", type: "button", "aria-expanded": open === r.id ? "true" : "false", onclick: () => onOpen(open === r.id ? null : r.id) },
      verdictBadge(h, r.verdict),
      h("strong", {}, r.op),
      h("span", { class: "muted" }, `${r.actor ?? "?"} · ${when(r.written)}`),
      h("span", { class: "rc-files" }, (r.outputs ?? []).join(", ") || "(không có file)"));
    return h("div", { class: "rc-item" }, head, open === r.id ? (detail ?? h("p", { class: "muted" }, "Đang đọc…")) : null);
  });
}

// A receipt in full: each check with level and detail, then the JSON.
export function receiptDetail(h, r) {
  const checks = (r.checks ?? []).map((c) => h("li", { class: c.pass ? "ok" : `bad ${c.level}` },
    h("span", { class: "rc-mark" }, c.pass ? "✓" : c.level === "warn" ? "!" : "✗"),
    h("code", {}, c.id), " ", h("span", { class: "muted" }, c.file ?? ""), " ", h("span", {}, c.detail ?? "")));
  return h("div", { class: "rc-detail" },
    checks.length ? h("ul", { class: "rc-checks" }, checks) : h("p", { class: "muted" }, "Không có kiểm nào."),
    h("details", {}, h("summary", {}, "JSON đầy đủ"), h("pre", { class: "rc-json" }, JSON.stringify(r, null, 2))));
}

// Line diff for "Xem thay đổi" of an AI turn: LCS over lines, unchanged runs folded to `context`
// lines around each change. Files too long for the table (cells above MAX_CELLS) show every old
// line removed and every new line added.
export type DiffRow = { kind: " " | "+" | "-"; text: string } | { kind: "…"; text: string };

const MAX_CELLS = 4_000_000;

export function lineDiff(before: string | null, after: string | null, context = 3): DiffRow[] {
  const a = before == null ? [] : before.split("\n");
  const b = after == null ? [] : after.split("\n");
  if (a.length * b.length > MAX_CELLS) return [...a.map((text) => ({ kind: "-" as const, text })), ...b.map((text) => ({ kind: "+" as const, text }))];
  const n = a.length, m = b.length;
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  }
  const rows: { kind: " " | "+" | "-"; text: string }[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { rows.push({ kind: " ", text: a[i] }); i++; j++; }
    else if (i < n && (j >= m || L[(i + 1) * w + j] >= L[i * w + j + 1])) rows.push({ kind: "-", text: a[i++] });
    else rows.push({ kind: "+", text: b[j++] });
  }
  const keep = rows.map(() => false);
  rows.forEach((r, k) => { if (r.kind !== " ") for (let x = Math.max(0, k - context); x <= Math.min(rows.length - 1, k + context); x++) keep[x] = true; });
  const out: DiffRow[] = [];
  let skipped = 0;
  rows.forEach((r, k) => {
    if (keep[k]) {
      if (skipped) out.push({ kind: "…", text: `${skipped} dòng không đổi` });
      skipped = 0;
      out.push(r);
    } else skipped++;
  });
  if (skipped) out.push({ kind: "…", text: `${skipped} dòng không đổi` });
  return out;
}

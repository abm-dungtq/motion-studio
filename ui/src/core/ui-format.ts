// Port of the formatting helpers of public/panels.js:29-37 and :73 (commit 2d65edf); logic
// unchanged. No React, so Node runs it directly.
export const safeUrl = (u: unknown): string | null => (/^https?:\/\//i.test(String(u ?? "")) ? String(u) : null);

// Shortens text at a word boundary so a card never ends mid-word.
export const clip = (t: unknown, n: number): string => {
  const s = String(t ?? "").trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n * 0.6)).trimEnd()}…`;
};

export const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`;

// 75.4 → "1:15".
export const mss = (s: unknown): string => {
  const t = Math.round(Number(s) || 0);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export const when = (iso: unknown): string => {
  const d = new Date(String(iso ?? ""));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

// A project file served under /p/<name>/.
export const fileUrl = (name: string, path: string): string => `/p/${encodeURIComponent(name)}/${path.split("/").map(encodeURIComponent).join("/")}`;

export const nfmt = (n: unknown): string => (Number(n) >= 1000 ? `${(Number(n) / 1000).toFixed(Number(n) >= 10000 ? 0 : 1)}k` : String(n));

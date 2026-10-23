// Port of round1, fmt, fmtS and isMedia from public/dom.js (commit 22e7611); logic unchanged.
// Small formatting helpers shared by the Studio modules (the DOM helpers stay behind: React
// renders the markup).
export const round1 = (x: number): number => Math.round(x * 10) / 10;

// 0:11.8 — minutes and tenths of a second.
export function fmt(t: unknown): string {
  const d = Math.max(0, Math.round((Number(t) || 0) * 10));
  return `${Math.floor(d / 600)}:${((d % 600) / 10).toFixed(1).padStart(4, "0")}`;
}
export const fmtS = (t: number): string => `${round1(t).toFixed(1)}s`;

export const isMedia = (p: string): "img" | "video" | null => /\.(png|jpe?g|webp|gif|svg)$/i.test(p) ? "img" : /\.(mp4|mov|webm)$/i.test(p) ? "video" : null;

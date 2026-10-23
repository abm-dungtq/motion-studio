// lib/nle/time.mjs — rational time for the NLE timelines (FCPXML, xmeml, OTIO). Every time is a
// whole number of frames, turned into seconds only as an exact fraction, so 29.97 never drifts.
// Learned from ChatOctopus/timeline src/time.ts (https://github.com/ChatOctopus/timeline,
// commit 352d8f8, MIT): reduced fractions, "num/dens" strings, NTSC as a 1001 denominator.
//   rational(fps)   frame rate as { num, den }: 30 → 30/1, 29.97 → 30000/1001, 23.976 → 24000/1001
//   frames(n, fps)  n frames as an FCPXML time: "n·den/num s" reduced, "0s" for zero
//   tc(n, fps)      n frames as non-drop timecode HH:MM:SS:FF on the nominal rate
//   timebase(r)     the nominal integer rate of r (30000/1001 → 30); ntsc(r) says den is 1001

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// A frame rate (number, or a rational { num, den }) as a reduced rational. A rate within 0.01 of
// n × 1000/1001 for a whole n is that NTSC rate; any other rate is read to 1/1000.
export function rational(fps) {
  if (fps && typeof fps === "object") {
    const { num, den } = fps;
    if (!(Number.isInteger(num) && Number.isInteger(den) && num > 0 && den > 0)) throw new Error(`fps không hợp lệ: ${num}/${den}`);
    const d = gcd(num, den);
    return { num: num / d, den: den / d };
  }
  const f = Number(fps);
  if (!Number.isFinite(f) || f <= 0) throw new Error(`fps không hợp lệ: ${fps}`);
  if (Math.abs(f - Math.round(f)) < 1e-6) return { num: Math.round(f), den: 1 };
  const n = Math.round((f * 1001) / 1000);
  if (Math.abs(f - (n * 1000) / 1001) < 0.01) return { num: n * 1000, den: 1001 };
  return rational({ num: Math.round(f * 1000), den: 1000 });
}

const count = (n) => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`số khung không hợp lệ: ${n}`);
  return n;
};

export function frames(n, fps) {
  const r = rational(fps);
  if (count(n) === 0) return "0s";
  const num = n * r.den, den = r.num, d = gcd(num, den);
  return den / d === 1 ? `${num / d}s` : `${num / d}/${den / d}s`;
}

export const timebase = (r) => Math.round(r.num / r.den);
export const ntsc = (r) => r.den === 1001;

export function tc(n, fps) {
  const base = timebase(rational(fps));
  count(n);
  const p = (x) => String(x).padStart(2, "0");
  const s = Math.floor(n / base);
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(n % base)}`;
}

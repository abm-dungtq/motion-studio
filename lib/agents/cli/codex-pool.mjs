// lib/agents/cli/codex-pool.mjs — codex-pool, a script that runs `codex exec` on whichever of
// two ChatGPT accounts has quota left and switches once on a quota error. Commands: status,
// exec <codex exec args>, use acct1|acct2|auto. It has no --version; the version shown is the
// codex it drives. `codex-pool status` prints, per account and then the pick:
//   acct1: OK   ok; 5h 38% (reset 22/10 20:47); week 12% (reset 29/10 10:36)
//   acct2: SKIP exhausted until 24/10 03:00; no usage data yet
//   pin=auto -> next: acct2            ("none available" when no account can run)
// Only names, states and percentages are kept; the script never prints tokens.
import { detectBin, exec, which } from "../run.mjs";
import { codexRun } from "./codex.mjs";

const ACCOUNT = /^([A-Za-z0-9_-]+):\s+(OK|SKIP)\s+([^;]*?)\s*;\s*(.*)$/;
const WINDOW = (label) => new RegExp(`\\b${label}\\s+(\\d+(?:\\.\\d+)?)%\\s*\\(reset\\s+([^)]+)\\)`);

// { accounts: [{ name, state, ok, reason, h5, reset_h5, week, reset_week }], pin, next } or null.
export function parseStatus(text) {
  const accounts = [];
  let pin = null, next = null;
  for (const line of String(text ?? "").split("\n").map((l) => l.trim())) {
    const a = ACCOUNT.exec(line);
    if (a) {
      const h5 = WINDOW("5h").exec(a[4]), week = WINDOW("week").exec(a[4]);
      accounts.push({ name: a[1], state: a[2], ok: a[2] === "OK", reason: a[3] || null,
        h5: h5 ? Number(h5[1]) : null, reset_h5: h5?.[2] ?? null, week: week ? Number(week[1]) : null, reset_week: week?.[2] ?? null });
      continue;
    }
    const p = /^pin=(\S+)\s*->\s*next:\s*(.+)$/.exec(line);
    if (p) { pin = p[1]; next = /^none/i.test(p[2]) ? null : p[2].trim(); }
  }
  return accounts.length ? { accounts, pin, next } : null;
}

// One `status` run serves auth() and quota() of the same scan.
const memo = new Map(); // path → { at, promise }
function status(io) {
  const m = memo.get(io.bin);
  if (m && Date.now() - m.at < 5000) return m.promise;
  const promise = exec(io.bin, ["status"], { env: io.env, timeout: 15000 }).then((r) => (r.error || r.code !== 0 ? null : parseStatus(r.stdout)));
  memo.set(io.bin, { at: Date.now(), promise });
  return promise;
}

export default {
  id: "codex-pool", label: "Codex (codex-pool)", rank: 15, bins: ["codex-pool"],
  caps: { text: "yes", vision: "yes", image: "yes" },
  async detect(io) {
    const d = await detectBin(["codex-pool"], { env: io.env, run: false });
    if (!d.found || d.error) return d;
    const codex = which("codex", io.env);
    if (!codex || codex.broken) return { ...d, error: "codex-pool cần codex trên PATH" };
    const v = await detectBin(["codex"], { env: io.env });
    return { ...d, version: v.version };
  },
  async auth(io) {
    const s = await status(io);
    if (!s) return { logged_in: null, method: null };
    const logged = s.accounts.filter((a) => a.reason !== "no login");
    return { logged_in: logged.length > 0, method: `ChatGPT, ${logged.length} tài khoản` };
  },
  quota: (io) => status(io),
  run: codexRun((io, rest) => [io.bin, rest]),
};

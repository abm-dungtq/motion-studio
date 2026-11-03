// lib/launch-agent.mjs — a macOS LaunchAgent that starts Motion Studio when the user logs in
// (bin/motion-studio.mjs install-app / uninstall-app).
//   plistFor(o)   the plist: `node <bin> start --root <root>` in the foreground (launchd keeps the
//                 process), MOTION_STUDIO_PORT / MOTION_STUDIO_STATE when given, RunAtLoad, and
//                 KeepAlive only after a failed exit, at most every ThrottleInterval seconds (start
//                 exits 3 while the port is held, which would otherwise retry without pause), and
//                 ProcessType Interactive: without it launchd throttles the job's CPU and I/O, and
//                 under load the port opened 15 s after start instead of 3 s
//   install(o)    refuses while a server answers on the port (nothing written), else writes
//                 ~/Library/LaunchAgents/<label>.plist and bootstraps it in gui/<uid>
//   uninstall(o)  boots it out and removes the file
// exec(cmd, args) runs launchctl; tests pass a fake one.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_LABEL = "com.motion-studio.server";
export const THROTTLE_S = 30;
export const LABEL = /^[A-Za-z0-9][A-Za-z0-9.-]{0,120}$/;

const xml = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const str = (v) => `<string>${xml(v)}</string>`;

export const plistPath = (label, home = homedir()) => join(home, "Library", "LaunchAgents", `${label}.plist`);

export function plistFor({ label, node, bin, root, port = null, state = null, logDir }) {
  const env = [port != null ? ["MOTION_STUDIO_PORT", port] : null, state ? ["MOTION_STUDIO_STATE", state] : null].filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${str(label)}
  <key>ProgramArguments</key>
  <array>${[node, bin, "start", "--root", root].map(str).join("")}</array>
${env.length ? `  <key>EnvironmentVariables</key>
  <dict>${env.map(([k, v]) => `<key>${xml(k)}</key>${str(v)}`).join("")}</dict>
` : ""}  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>${THROTTLE_S}</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key>${str(join(logDir, "launch-agent.log"))}
  <key>StandardErrorPath</key>${str(join(logDir, "launch-agent.log"))}
</dict>
</plist>
`;
}

// true when something accepts a connection on 127.0.0.1:<port> within 1 s.
export function portBusy(port) {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(1000, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

const launchctl = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
const uid = () => process.getuid();

export async function install({ label = DEFAULT_LABEL, home = homedir(), node, bin, root, port, state = null, logDir, exec = launchctl, busy = portBusy }) {
  if (!LABEL.test(label)) return { ok: false, error: `nhãn không hợp lệ: ${label}` };
  if (await busy(port)) return { ok: false, error: `Cổng ${port} đang có Studio chạy; dừng nó trước (stop) rồi cài lại` };
  const file = plistPath(label, home);
  mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
  mkdirSync(logDir, { recursive: true });
  writeFileSync(file, plistFor({ label, node, bin, root, port, state, logDir }));
  try { exec("launchctl", ["bootout", `gui/${uid()}/${label}`]); } catch { /* not loaded */ }
  try { exec("launchctl", ["bootstrap", `gui/${uid()}`, file]); } catch (e) {
    return { ok: false, file, error: `launchctl bootstrap lỗi: ${String(e.stderr || e.message).trim()}` };
  }
  return { ok: true, file };
}

export function uninstall({ label = DEFAULT_LABEL, home = homedir(), exec = launchctl }) {
  if (!LABEL.test(label)) return { ok: false, error: `nhãn không hợp lệ: ${label}` };
  const file = plistPath(label, home);
  try { exec("launchctl", ["bootout", `gui/${uid()}/${label}`]); } catch { /* not loaded */ }
  const had = existsSync(file);
  rmSync(file, { force: true });
  return { ok: true, file, removed: had };
}

// lib/drive.mjs — uploads the delivery folder of an episode to Google Drive with the gws CLI
// (Google Workspace CLI). Studio holds no Google credential: gws keeps its own login.
// The gws binary is $MOTION_STUDIO_GWS (a path; a .mjs or .js file runs under node), else `gws`
// on the agents' search path (lib/agents/run.mjs). Every call runs without a shell. One upload:
//   1. `gws drive about get` names the signed-in account; another account than the series' drive
//      account stops before anything is written.
//   2. The folder drive.folder at the root of My Drive is looked up, and made once when missing.
//   3. Each file is created in it with `--upload <name>`, cwd the delivery folder (gws refuses paths
//      outside its cwd); a file already there with the same name and size is not sent again.
//      The size Drive answers is compared with the file on disk.
// dryRun adds gws' own --dry-run to every write (folder and files): gws checks the request
// locally and sends nothing; the reads still run. Raw gws output is never kept: answers are parsed
// for the few fields used, and stderr lines go through redact().
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { redact } from "./agents/redact.mjs";
import { which } from "./agents/run.mjs";
import { maskAccount } from "./series.mjs";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
const TIMEOUT_MS = 30 * 60000;
const READ_TIMEOUT_MS = 60000;
const err = (status, msg) => Object.assign(new Error(msg), { status });

// → { cmd, pre } (pre: the script for node), or null when no gws is found.
export function gwsCommand(env = process.env) {
  const set = env.MOTION_STUDIO_GWS;
  if (set) return /\.(mjs|js)$/.test(set) ? { cmd: process.execPath, pre: [set] } : { cmd: set, pre: [] };
  const w = which("gws", env);
  return w && !w.broken ? { cmd: w.path, pre: [] } : null;
}

// One gws call: { code, json, error }. json is the parsed stdout (null when it is not JSON).
export function runGws(gws, args, { cwd = process.cwd(), env = process.env, timeoutMs = READ_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let out = "", errText = "";
    let child;
    try { child = spawn(gws.cmd, [...gws.pre, ...args], { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { resolve({ code: 127, json: null, error: redact(e.message) }); return; }
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (c) => { if (out.length < 4 << 20) out += c; });
    child.stderr.setEncoding("utf8").on("data", (c) => { if (errText.length < 64 << 10) errText += c; });
    child.on("error", (e) => { errText += `\n${e.message}`; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let json = null;
      try { json = JSON.parse(out); } catch { /* not JSON */ }
      const why = errText.split("\n").map((l) => l.trim()).filter((l) => l && !/^Using keyring backend/.test(l)).slice(-3).join(" | ");
      resolve({ code: code ?? (signal ? 1 : 0), json, error: why ? redact(why).slice(0, 400) : null });
    });
  });
}

const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const gwsFail = (what, r) => Object.assign(new Error(`${what}: gws lỗi (exit ${r.code})${r.error ? `: ${r.error}` : ""}`), { code: `gws-${r.code}` });

// files: [{ name, size }] in dir (the delivery folder). → the result of the upload, never throws for
// a gws failure (ok false with code and error); throws 400 for bad input.
export async function driveUpload({ dir, files, account, folder, dryRun = false, env = process.env, gws = gwsCommand(env), run = runGws, log = () => {} }) {
  if (!account || !folder) throw err(400, "series chưa khai báo drive.account và drive.folder");
  if (!Array.isArray(files) || !files.length) throw err(400, "thư mục giao nộp chưa có file nào để tải lên");
  if (!gws) return { ok: false, code: "no-gws", error: "Không tìm thấy gws (Google Workspace CLI). Cài gws hoặc đặt MOTION_STUDIO_GWS rồi thử lại." };
  const shown = { account: maskAccount(account), folder, dry_run: dryRun };
  const write = dryRun ? ["--dry-run"] : [];
  try {
    const about = await run(gws, ["drive", "about", "get", "--params", JSON.stringify({ fields: "user(emailAddress)" })], { env });
    if (about.code !== 0) throw gwsFail("kiểm tài khoản Drive", about);
    const email = about.json?.user?.emailAddress;
    if (typeof email !== "string" || !email) return { ...shown, ok: false, code: "account", error: "gws chưa đăng nhập Google (gws auth login) hoặc không trả về email tài khoản" };
    if (email.toLowerCase() !== String(account).toLowerCase()) return { ...shown, ok: false, code: "account", error: `Drive đang đăng nhập ${maskAccount(email)}, series cần ${maskAccount(account)}. Đăng nhập gws đúng tài khoản rồi thử lại; chưa tải gì lên.` };
    log(`tài khoản Drive đúng (${maskAccount(email)})`);

    const found = await run(gws, ["drive", "files", "list", "--params", JSON.stringify({ q: `name = '${q(folder)}' and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`, fields: "files(id,name)" })], { env });
    if (found.code !== 0) throw gwsFail(`tìm thư mục ${folder}`, found);
    let folderId = found.json?.files?.[0]?.id ?? null;
    let createdFolder = false;
    if (!folderId) {
      const made = await run(gws, ["drive", "files", "create", "--json", JSON.stringify({ name: folder, mimeType: FOLDER_MIME }), "--params", JSON.stringify({ fields: "id" }), ...write], { env });
      if (made.code !== 0) throw gwsFail(`tạo thư mục ${folder}`, made);
      folderId = dryRun ? null : made.json?.id ?? null;
      if (!dryRun && !folderId) return { ...shown, ok: false, code: "folder", error: `gws không trả về id của thư mục ${folder} vừa tạo` };
      createdFolder = true;
      log(`${dryRun ? "(chạy khô) sẽ tạo" : "đã tạo"} thư mục ${folder}`);
    }

    let there = [];
    if (folderId) {
      const listed = await run(gws, ["drive", "files", "list", "--params", JSON.stringify({ q: `'${q(folderId)}' in parents and trashed = false`, fields: "files(id,name,size,webViewLink)" })], { env });
      if (listed.code !== 0) throw gwsFail(`liệt kê thư mục ${folder}`, listed);
      there = Array.isArray(listed.json?.files) ? listed.json.files : [];
    }

    const out = [];
    for (const f of files) {
      const size = statSync(join(dir, f.name)).size;
      const same = there.find((x) => x.name === f.name && Number(x.size) === size);
      if (same) { out.push({ name: f.name, size, remote_size: size, link: same.webViewLink ?? null, ok: true, result: "đã có trên Drive" }); continue; }
      log(`${dryRun ? "kiểm" : "tải"} ${f.name} (${(size / 1048576).toFixed(1)} MB)`);
      const r = await run(gws, ["drive", "files", "create", "--json", JSON.stringify({ name: f.name, parents: [folderId ?? "THU-MUC-MOI"] }), "--upload", f.name, "--params", JSON.stringify({ fields: "id,size,webViewLink" }), ...write], { cwd: dir, env, timeoutMs: TIMEOUT_MS });
      if (r.code !== 0) { out.push({ name: f.name, size, ok: false, result: "lỗi", error: gwsFail(`tải ${f.name}`, r).message }); continue; }
      if (dryRun) { out.push({ name: f.name, size, ok: r.json?.dry_run === true, result: r.json?.dry_run === true ? "chạy khô: gws nhận lệnh" : "chạy khô: gws không xác nhận" }); continue; }
      const remote = Number(r.json?.size);
      const ok = remote === size;
      out.push({ name: f.name, size, remote_size: Number.isFinite(remote) ? remote : null, link: typeof r.json?.webViewLink === "string" ? r.json.webViewLink : null, ok, result: ok ? "đã tải, khớp kích thước" : "lệch kích thước", ...(ok ? {} : { error: `kích thước lệch: máy ${size} byte, Drive ${Number.isFinite(remote) ? remote : "không rõ"} byte` }) });
    }
    const bad = out.filter((x) => !x.ok);
    return { ...shown, ok: !bad.length, ...(bad.length ? { code: bad.some((x) => x.result === "lệch kích thước") ? "size" : "upload", error: `${bad.length} file lỗi: ${bad.map((x) => x.name).join(", ")}` } : {}), folder_created: createdFolder, files: out };
  } catch (e) {
    return { ...shown, ok: false, code: e.code ?? "error", error: redact(e.message) };
  }
}

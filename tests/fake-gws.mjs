#!/usr/bin/env node
// tests/fake-gws.mjs — a stand-in for the gws CLI (Google Workspace) with the few Drive calls
// lib/drive.mjs makes. State is a JSON file ($FAKE_GWS_STATE): { folders: [{ id, name }],
// files: [{ id, name, parent, size }], calls: [argv…] }. Every answer carries a fake
// access_token, so tests can check it never reaches a receipt.
//   drive about get --params …                      → { user: { emailAddress: $FAKE_GWS_EMAIL } }
//   drive files list --params { q }                 → folders at the root by name, or files of a folder
//   drive files create --json {…} [--upload <name>] [--params …] [--dry-run]
// --upload reads <name> from the cwd (a path outside it is refused, like gws). The size answered
// is the file's, plus one byte when the name is $FAKE_GWS_SKEW. $FAKE_GWS_FAIL=<code> exits with
// that code on every write.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

const TOKEN = "ya29.FAKE-access-token-never-store-0123456789";
const file = process.env.FAKE_GWS_STATE;
if (!file) { console.error("fake-gws: FAKE_GWS_STATE chưa đặt"); process.exit(2); }
const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { folders: [], files: [], calls: [] };
const argv = process.argv.slice(2);
state.calls.push(argv);
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
const say = (o) => { save(); console.error("Using keyring backend: keyring"); console.log(JSON.stringify({ ...o, access_token: TOKEN })); process.exit(0); };
const fail = (code, msg) => { save(); console.error(`${msg} access_token=${TOKEN}`); process.exit(code); };
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const json = (k) => { const v = opt(k); return v ? JSON.parse(v) : {}; };
const sub = argv.slice(0, 3).join(" ");
const dry = argv.includes("--dry-run");

if (sub === "drive about get") say({ user: { emailAddress: process.env.FAKE_GWS_EMAIL ?? "someone@example.com" } });
if (sub === "drive files list") {
  const q = String(json("--params").q ?? "");
  const byName = /name = '((?:[^'\\]|\\.)*)'/.exec(q);
  if (byName && q.includes("'root' in parents")) say({ files: state.folders.filter((f) => f.name === byName[1].replace(/\\(.)/g, "$1")).map(({ id, name }) => ({ id, name })) });
  const parent = /'([^']+)' in parents/.exec(q);
  if (parent) say({ files: state.files.filter((f) => f.parent === parent[1]).map(({ id, name, size }) => ({ id, name, size: String(size), webViewLink: `https://drive.example/${id}` })) });
  fail(3, `fake-gws: q không hiểu: ${q}`);
}
if (sub === "drive files create") {
  const body = json("--json");
  const up = opt("--upload");
  if (dry) say({ dry_run: true, method: "POST", url: "https://www.googleapis.com/upload/drive/v3/files", body, is_multipart_upload: Boolean(up), query_params: [] });
  if (process.env.FAKE_GWS_FAIL) fail(Number(process.env.FAKE_GWS_FAIL), "fake-gws: lỗi giả");
  if (body.mimeType === "application/vnd.google-apps.folder") {
    const f = { id: `fold-${state.folders.length + 1}`, name: body.name };
    state.folders.push(f);
    say({ id: f.id });
  }
  if (!up || isAbsolute(up) || normalize(up).startsWith("..")) fail(3, "fake-gws: --upload phải là đường trong thư mục hiện tại");
  const size = statSync(join(process.cwd(), up)).size + (process.env.FAKE_GWS_SKEW === up ? 1 : 0);
  const f = { id: `file-${state.files.length + 1}`, name: body.name, parent: body.parents?.[0] ?? null, size };
  state.files.push(f);
  say({ id: f.id, size: String(size), webViewLink: `https://drive.example/${f.id}` });
}
fail(2, `fake-gws: lệnh không hỗ trợ: ${argv.join(" ")}`);

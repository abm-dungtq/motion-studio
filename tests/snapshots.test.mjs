// lib/snapshots.mjs: copy before an AI turn, compare after, undo text files and project.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as snap from "../lib/snapshots.mjs";

const ID = "r-20261101120000-abcd";
const ID2 = "r-20261101120500-beef";

function project() {
  const dir = mkdtempSync(join(tmpdir(), "snap-"));
  const put = (rel, text) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };
  put("project.json", JSON.stringify({ version: 3, capabilities: { editable: true }, shots: [{ id: "s1" }], lines: [{ id: "l1", file: "assets/voice/01.mp3", text: "Xin chào" }] }));
  put("index.html", "<html>v3</html>");
  put("PLAN.md", "# plan v3");
  put("compositions/a.html", "<div>a</div>");
  put("assets/voice/01.mp3", "AUDIO-OLD");
  put("renders/out.mp4", "VIDEO");
  put("node_modules/x/index.js", "skip");
  put(".opus/history.jsonl", "");
  return { dir, put };
}
const withProject = (fn) => { const p = project(); try { return fn(p); } finally { rmSync(p.dir, { recursive: true, force: true }); } };

// A gateway restore that writes the manifest as base + 1, like the provider's.
const fakeGw = (calls = []) => ({
  restore(dir, { base, manifest, note }) {
    calls.push({ base, note });
    const cur = JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
    if (cur.version !== base) return { code: 3, error: `CONFLICT: base ${base}, hiện tại v${cur.version}` };
    writeFileSync(join(dir, "project.json"), JSON.stringify({ ...manifest, version: base + 1 }));
    return { code: 0, version: base + 1 };
  },
});
const load = (dir) => JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));

test("take copies text files only, skips build and media folders, and keeps the first copy", () => withProject(({ dir, put }) => {
  const m = snap.take(dir, ID, { version: 3 });
  assert.deepEqual(Object.keys(m.files).sort(), ["PLAN.md", "compositions/a.html", "index.html", "project.json"]);
  assert.ok(m.media["assets/voice/01.mp3"], "media are listed, not copied");
  assert.ok(!existsSync(join(dir, ".opus/snapshots", ID, "files/assets")));
  put("index.html", "<html>changed</html>");
  assert.equal(snap.take(dir, ID, { version: 9 }).version, 3, "a relaunch keeps the first snapshot");
  assert.equal(readFileSync(join(dir, ".opus/snapshots", ID, "files/index.html"), "utf8"), "<html>v3</html>");
}));

test("finish removes a snapshot of a turn that changed nothing", () => withProject(({ dir }) => {
  snap.take(dir, ID, { version: 3 });
  assert.equal(snap.finish(dir, ID, { version: 3 }), null);
  assert.ok(!existsSync(join(dir, ".opus/snapshots", ID)));
}));

test("finish summarises changed, added, removed and overwritten files", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("index.html", "<html>v5</html>");
  put("compositions/b.html", "<div>b</div>");
  rmSync(join(dir, "PLAN.md"));
  put("assets/voice/01.mp3", "AUDIO-NEW-TAKE");
  put("assets/img/new.png", "PNG");
  const m = snap.finish(dir, ID, { version: 5 });
  assert.equal(m.state, "done");
  assert.deepEqual(m.summary.changed, ["index.html"]);
  assert.deepEqual(m.summary.added, ["compositions/b.html"]);
  assert.deepEqual(m.summary.removed, ["PLAN.md"]);
  assert.deepEqual(m.summary.overwritten, ["assets/voice/01.mp3"]);
  assert.deepEqual(m.summary.created, ["assets/img/new.png"]);
  assert.equal(m.summary.from, 3);
  assert.equal(m.summary.to, 5);
}));

test("restore puts text files back, removes added ones, restores project.json and names re-voice lines", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("project.json", JSON.stringify({ ...load(dir), version: 5, shots: [{ id: "s1" }, { id: "s2" }] }));
  put("index.html", "<html>v5</html>");
  put("compositions/b.html", "<div>b</div>");
  rmSync(join(dir, "PLAN.md"));
  put("assets/voice/01.mp3", "AUDIO-NEW-TAKE");
  snap.finish(dir, ID, { version: 5 });
  const calls = [];
  const r = snap.restore(dir, ID, { load, gw: fakeGw(calls) });
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "<html>v3</html>");
  assert.equal(readFileSync(join(dir, "PLAN.md"), "utf8"), "# plan v3");
  assert.ok(!existsSync(join(dir, "compositions/b.html")));
  assert.deepEqual(calls, [{ base: 5, note: `hoàn tác lượt AI ${ID}` }]);
  assert.equal(r.version, 6);
  assert.deepEqual(load(dir).shots, [{ id: "s1" }]);
  assert.deepEqual(r.overwritten, ["assets/voice/01.mp3"]);
  assert.deepEqual(r.lines, [{ id: "l1", text: "Xin chào" }]);
  assert.equal(snap.readMeta(dir, ID).state, "restored");
  assert.throws(() => snap.restore(dir, ID, { load, gw: fakeGw() }), /đã được hoàn tác/);
}));

test("restore asks first when project.json changed after the turn, and goes on with force", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("project.json", JSON.stringify({ ...load(dir), version: 4, shots: [] }));
  snap.finish(dir, ID, { version: 4 });
  put("project.json", JSON.stringify({ ...load(dir), version: 5, shots: [{ id: "x" }] }));
  put("index.html", "<html>user edit</html>");
  assert.throws(() => snap.restore(dir, ID, { load, gw: fakeGw() }), (e) => e.code === "NEWER" && /v4 → v5/.test(e.message));
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "<html>user edit</html>", "nothing is written before the answer");
  const r = snap.restore(dir, ID, { load, gw: fakeGw(), force: true });
  assert.equal(r.version, 6);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "<html>v3</html>");
}));

test("restore without the gateway's restore refuses before touching files", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("project.json", JSON.stringify({ ...load(dir), version: 4, shots: [] }));
  put("index.html", "<html>v4</html>");
  snap.finish(dir, ID, { version: 4 });
  assert.throws(() => snap.restore(dir, ID, { load, gw: {} }), /cập nhật plugin/);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "<html>v4</html>");
}));

test("sync follows an ask chain to its first request and finishes only when the chain ends", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("index.html", "<html>v4</html>");
  const reqs = [
    { id: ID, status: "done", base: 3 },
    { id: ID2, status: "running", follows: ID, base: 3 },
  ];
  assert.deepEqual(snap.sync(dir, reqs, 4), []);
  assert.ok(!existsSync(join(dir, ".opus/snapshots", ID2)), "the follow-up shares the first snapshot");
  reqs[1].status = "done";
  assert.deepEqual(snap.sync(dir, reqs, 4), [ID]);
  assert.equal(snap.readMeta(dir, ID).state, "done");
}));

test("sync takes a late snapshot for a request claimed outside Studio", () => withProject(({ dir }) => {
  snap.sync(dir, [{ id: ID, status: "running", base: 3 }], 3);
  const m = snap.readMeta(dir, ID);
  assert.equal(m.late, true);
  assert.equal(m.state, "open");
}));

test("prune keeps the newest ten closed snapshots", () => withProject(({ dir, put }) => {
  for (let i = 0; i < 12; i++) {
    const id = `r-202611011200${String(i).padStart(2, "0")}-abcd`;
    snap.take(dir, id, { version: 3 });
    put("index.html", `<html>${i}</html>`);
    snap.finish(dir, id, { version: 3 });
    const f = join(dir, ".opus/snapshots", id, "meta.json");
    const m = JSON.parse(readFileSync(f, "utf8"));
    writeFileSync(f, JSON.stringify({ ...m, at: `2026-11-01T12:00:${String(i).padStart(2, "0")}.000Z` }));
  }
  snap.prune(dir);
  const left = snap.list(dir);
  assert.equal(left.length, 10);
  assert.equal(left[0].id, "r-20261101120011-abcd");
}));

test("an id that is not a request id is refused", () => withProject(({ dir }) => {
  assert.throws(() => snap.take(dir, "../../etc", {}), /id không hợp lệ/);
}));


test("a failed gateway restore puts every file back as it was before Hoàn tác", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("project.json", JSON.stringify({ ...load(dir), version: 4, shots: [] }));
  put("index.html", "<html>v4</html>");
  put("compositions/b.html", "<div>b</div>");
  rmSync(join(dir, "PLAN.md"));
  snap.finish(dir, ID, { version: 4 });
  const busy = { restore: () => ({ code: 8, error: "BUSY: project.json đang được ghi" }) };
  assert.throws(() => snap.restore(dir, ID, { load, gw: busy }), /BUSY/);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "<html>v4</html>");
  assert.equal(readFileSync(join(dir, "compositions/b.html"), "utf8"), "<div>b</div>");
  assert.ok(!existsSync(join(dir, "PLAN.md")));
  assert.equal(snap.readMeta(dir, ID).state, "done", "the turn can still be undone");
}));

test("a follow-up of a chain whose snapshot is closed gets a snapshot of its own", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("index.html", "<html>v4</html>");
  snap.finish(dir, ID, { version: 3 });
  snap.keep(dir, ID);
  const reqs = [{ id: ID, status: "failed", base: 3 }, { id: ID2, status: "running", follows: ID, base: 3 }];
  assert.equal(snap.chainKey(dir, new Map(reqs.map((r) => [r.id, r])), reqs[1]), ID2);
  snap.sync(dir, reqs, 3);
  assert.equal(snap.readMeta(dir, ID2).state, "open", "the new snapshot stays open while its request runs");
  assert.equal(snap.readMeta(dir, ID).state, "kept");
}));

test("meta.json paths outside the project are refused before anything is written", () => withProject(({ dir, put }) => {
  snap.take(dir, ID, { version: 3 });
  put("index.html", "<html>v4</html>");
  snap.finish(dir, ID, { version: 3 });
  const f = join(dir, ".opus/snapshots", ID, "meta.json");
  const m = JSON.parse(readFileSync(f, "utf8"));
  m.files["../escape.txt"] = "0";
  writeFileSync(f, JSON.stringify(m));
  assert.throws(() => snap.restore(dir, ID, { load, gw: fakeGw() }), /ngoài dự án/);
  assert.throws(() => snap.changes(dir, ID), /ngoài dự án/);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "<html>v4</html>");
}));

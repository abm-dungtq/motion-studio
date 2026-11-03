import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROUTES } from "../routes/notes.mjs";
import { readNotes } from "../lib/notes.mjs";

const route = (method, path) => ROUTES.find((r) => r.method === method && r.path === path);

// The routes against a stub provider; the runner is mcp so no director process starts.
function withProject(fn, { failEnqueue = false } = {}) {
  return async () => {
    const d = mkdtempSync(join(tmpdir(), "ms-notes-routes-"));
    const savedState = process.env.MOTION_STUDIO_STATE;
    process.env.MOTION_STUDIO_STATE = join(d, "studio.json");
    writeFileSync(process.env.MOTION_STUDIO_STATE, JSON.stringify({ director: { runner: "mcp" } }));
    const requests = [];
    const P = {
      manifest: { load: () => ({ version: 7, shots: [] }) },
      requests: {
        enqueue: (dir, r) => {
          if (failEnqueue) throw new Error("hàng đợi hỏng");
          const x = { id: `r${requests.length + 1}`, status: "queued", ...r }; requests.push(x); return x;
        },
        list: () => requests,
      },
    };
    const c = (body, query = {}) => ({ body, P, q: (k) => query[k] ?? null, withManifest: (name) => (name === "p" ? { dir: d } : { error: "không có dự án", status: 404 }) });
    try { await fn({ d, c, requests }); } finally {
      rmSync(d, { recursive: true, force: true });
      if (savedState === undefined) delete process.env.MOTION_STUDIO_STATE; else process.env.MOTION_STUDIO_STATE = savedState;
    }
  };
}

test("add, list, update and remove notes through the routes", withProject(async ({ d, c }) => {
  const a = await route("POST", "/api/notes/add").handler(c({ name: "p", t: 12.4, text: "chữ ra muộn", shot: "s03" }));
  assert.equal(a.state, "open");
  const list = await route("GET", "/api/notes").handler(c({}, { name: "p" }));
  assert.deepEqual(list.notes.map((n) => n.text), ["chữ ra muộn"]);
  assert.equal((await route("POST", "/api/notes/update").handler(c({ name: "p", id: a.id, state: "done" }))).state, "done");
  assert.deepEqual(await route("POST", "/api/notes/remove").handler(c({ name: "p", id: a.id })), { ok: true });
  assert.deepEqual(readNotes(d).notes, []);
  await assert.rejects(route("POST", "/api/notes/add").handler(c({ name: "p", t: 1, text: " " })), (e) => e.status === 400);
  await assert.rejects(route("GET", "/api/notes").handler(c({}, { name: "q" })), (e) => e.status === 404);
}));

test("send queues one project request listing the notes, then marks them sent", withProject(async ({ d, c, requests }) => {
  const add = route("POST", "/api/notes/add").handler;
  const a = await add(c({ name: "p", t: 12.4, text: "chữ ra muộn", shot: "s03" }));
  const b = await add(c({ name: "p", t: 30, text: "nhạc to quá" }));
  const out = await route("POST", "/api/notes/send").handler(c({ name: "p", ids: [a.id, b.id] }));
  assert.equal(out.request.id, "r1");
  assert.equal(out.runner, "mcp");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].scope, "project");
  assert.equal(requests[0].base, 7);
  assert.match(requests[0].text, /^Sửa theo các ghi chú/);
  assert.match(requests[0].text, /1\. 0:12\.4 · s03 · chữ ra muộn\n2\. 0:30\.0 · — · nhạc to quá/);
  assert.deepEqual(readNotes(d).notes.map((n) => [n.state, n.request]), [["sent", "r1"], ["sent", "r1"]]);
  await assert.rejects(route("POST", "/api/notes/send").handler(c({ name: "p", ids: [] })), (e) => e.status === 400);
  await assert.rejects(route("POST", "/api/notes/send").handler(c({ name: "p", ids: ["n-nope"] })), (e) => e.status === 404);
  assert.equal(requests.length, 1, "nothing queued for a bad send");
}));

test("a request that cannot be queued leaves the notes open", withProject(async ({ d, c }) => {
  const a = await route("POST", "/api/notes/add").handler(c({ name: "p", t: 1, text: "x" }));
  await assert.rejects(route("POST", "/api/notes/send").handler(c({ name: "p", ids: [a.id] })), (e) => e.status === 400);
  assert.equal(readNotes(d).notes[0].state, "open");
}, { failEnqueue: true }));

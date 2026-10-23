import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listReceipts, writeReceipt } from "../lib/receipts.mjs";
import { kindOf, runChecks } from "../lib/quality.mjs";

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

test("a receipt holds the sha256 and size of every output and the checks it passed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ms-receipt-"));
  try {
    const out = join(dir, "renders", "a.txt");
    mkdirSync(join(dir, "renders"));
    writeFileSync(out, "hello receipts");
    const r = await writeReceipt(dir, { op: "nle-export", actor: "human", tool: { name: "t" }, params: { prompt: "token=0123456789abcdef0123456789abcdef" }, inputs: { a: 1 }, outputs: [out], started: new Date(Date.now() - 1000) });
    assert.equal(r.outputs[0].path, "renders/a.txt");
    assert.equal(r.outputs[0].size, 14);
    assert.equal(r.outputs[0].sha256, createHash("sha256").update("hello receipts").digest("hex"));
    assert.deepEqual(r.checks.map((c) => [c.id, c.pass, c.file]), [["exists-nonempty", true, "renders/a.txt"]], "probe-readable only applies to media");
    assert.equal(r.pass, true);
    assert.doesNotMatch(JSON.stringify(r), /0123456789abcdef0123/, "params are redacted");
    assert.match(r.file, /^\.opus\/receipts\/\d{8}\/nle-export-[a-z0-9]+-[0-9a-f]{6}\.json$/);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, r.file), "utf8")).outputs, r.outputs);
    // Atomic: only the final .json is left.
    assert.ok(walk(join(dir, ".opus")).every((f) => f.endsWith(".json")), walk(join(dir, ".opus")).join("\n"));
    const second = await writeReceipt(dir, { op: "image-generate", outputs: [] });
    assert.deepEqual(listReceipts(dir).map((x) => x.id), [second.id, r.id]);
    assert.deepEqual(listReceipts(dir, { op: "nle-export" }).map((x) => x.id), [r.id]);
    assert.deepEqual(listReceipts(dir, { limit: 1 }).map((x) => x.id), [second.id]);
    assert.deepEqual(listReceipts(join(dir, "none")), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("exists-nonempty fails a 0-byte file and probe-readable a file ffprobe cannot read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ms-quality-"));
  try {
    const empty = join(dir, "empty.png"), junk = join(dir, "junk.mp4");
    writeFileSync(empty, "");
    writeFileSync(junk, "not a video");
    const res = await runChecks([empty, junk, join(dir, "missing.bin")]);
    const get = (file, id) => res.find((c) => c.file === file && c.id === id);
    assert.equal(get(empty, "exists-nonempty").pass, false);
    assert.match(get(empty, "exists-nonempty").detail, /0 byte/);
    assert.equal(get(junk, "exists-nonempty").pass, true);
    assert.equal(get(junk, "probe-readable").pass, false);
    assert.equal(get(join(dir, "missing.bin"), "exists-nonempty").pass, false);
    const r = await writeReceipt(dir, { op: "x-test", outputs: [empty] });
    assert.equal(r.pass, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checks are loaded from the folder: a new module adds its own", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ms-checks-"));
  try {
    writeFileSync(join(dir, "a.mjs"), `export const CHECKS = [{ id: "always-no", applies: (f, kind) => kind === "image", run: () => ({ pass: false, detail: "nope" }) }, { id: "throws", applies: () => true, run: () => { throw new Error("boom"); } }];`);
    const res = await runChecks([join(dir, "x.png")], { dir });
    assert.deepEqual(res.map((c) => [c.id, c.pass]), [["always-no", false], ["throws", false]]);
    assert.match(res[1].detail, /boom/);
    assert.equal(kindOf("a.MOV"), "video");
    assert.equal(kindOf("a.json"), "other");
    await assert.rejects(writeReceipt(dir, { op: "Bad Op", outputs: [] }), /op/);
    await assert.rejects(writeReceipt(dir, { op: "ok-op", outputs: ["relative.png"] }), /tuyệt đối/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

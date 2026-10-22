#!/usr/bin/env node
// scripts/library-thumbs.mjs — downloads the cover image of every library video once, into
// ~/.cache/motion-studio/library/thumbs (MOTION_STUDIO_THUMBS overrides), as <post id>.<ext>.
//   node scripts/library-thumbs.mjs [--limit n] [--only-featured]
// A video that already has an image is skipped; for the rest the URLs listed in library.json are
// tried in order. Only image/* answers up to 3 MB are kept. Exit 0 even when some images are
// missing (the library shows an empty frame for them); 1 when library.json is missing.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LIBRARY_FILE, thumbDir, thumbFile } from "../lib/library.mjs";

const MAX_BYTES = 3 * 1024 * 1024;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const ALLOWED = /^https:\/\/(media\.skillry\.dev|pbs\.twimg\.com|raw\.githubusercontent\.com)\//;

export async function fetchImage(url, { timeout = 20000, fetchFn = fetch } = {}) {
  if (!ALLOWED.test(url)) return null;
  const r = await fetchFn(url, { signal: AbortSignal.timeout(timeout), redirect: "follow" });
  const type = String(r.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!r.ok || !EXT[type] || Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length && buf.length <= MAX_BYTES ? { buf, ext: EXT[type] } : null;
}

export async function main(argv = process.argv.slice(2), { log = console.log, fetchFn = fetch, file = LIBRARY_FILE, dir = thumbDir() } = {}) {
  if (!existsSync(file)) { console.error(`không có ${file} (chạy scripts/build-library.mjs trước)`); return 1; }
  const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : Infinity;
  const lib = JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(dir, { recursive: true });
  const want = lib.videos.filter((v) => v.thumbs?.length && (!argv.includes("--only-featured") || v.featured));
  const had = want.filter((v) => thumbFile(v.id, dir)).length;
  const todo = want.filter((v) => !thumbFile(v.id, dir)).slice(0, limit);
  let ok = 0, miss = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const v = todo[i++];
      let got = null;
      for (const url of v.thumbs) {
        try { got = await fetchImage(url, { fetchFn }); } catch { got = null; }
        if (got) break;
      }
      if (got) {
        const tmp = join(dir, `.${v.id}.part`);
        writeFileSync(tmp, got.buf);
        renameSync(tmp, join(dir, `${v.id}.${got.ext}`));
        ok++;
      } else miss++;
      if ((ok + miss) % 50 === 0) log(`ảnh: ${ok + miss}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  log(`ảnh: tải ${ok}, không lấy được ${miss}, đã có sẵn ${had} (${dir})`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());

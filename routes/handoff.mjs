// routes/handoff.mjs — the "needs outside help" cards of a project (lib/handoff.mjs). They need no
// provider: the files are Studio's own.
//   GET  /api/handoff?name=<project>          → { cards: [{ step, file, text, paste }] }, the open ones
//   POST /api/handoff/resolve { name, step, note? }
//        → appends `resolved: user@studio <ISO> <note>` to .opus/handoff/<step>.md; the card goes.
//          No open card for that step is 404, one already resolved 409.
import { realpathSync } from "node:fs";
import { BY } from "../gates.mjs";
import { openHandoffs, resolveHandoff } from "../lib/handoff.mjs";

const bad = (status, msg) => Object.assign(new Error(msg), { status });
function dirOf(c, name) {
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.status, pd.error);
  return realpathSync(pd.dir);
}

export const ROUTES = [
  {
    method: "GET", path: "/api/handoff", provider: false,
    handler(c) { return { cards: openHandoffs(dirOf(c, c.q("name"))) }; },
  },
  {
    method: "POST", path: "/api/handoff/resolve", provider: false,
    handler(c) {
      const b = c.body ?? {};
      if (b.note != null && typeof b.note !== "string") throw bad(400, "note: cần chữ");
      return { ok: true, ...resolveHandoff(dirOf(c, b.name), b.step, { by: BY, note: b.note ?? "" }) };
    },
  },
];

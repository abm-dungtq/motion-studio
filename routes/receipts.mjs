// routes/receipts.mjs — receipts of a project and quality checks on demand (lib/tools/receipts.mjs).
// None needs a provider.
//   GET  /api/receipts?name=&op=&limit=   → { receipts: [{ id, op, actor, written, verdict, outputs, failed, file }] }
//   GET  /api/receipt?name=&id=           → the receipt, with verdict and each check's level
//   POST /api/media/check { name, files, expected?, allow? }
//                                         → runs the checks, writes a media-check receipt, answers it
import { checkMedia, getReceipt, listRows } from "../lib/tools/receipts.mjs";

const dirOf = (c, name) => {
  const pd = c.projectDir(name);
  if (pd.error) throw Object.assign(new Error(pd.error), { status: pd.status });
  return pd.dir;
};

export const ROUTES = [
  {
    method: "GET", path: "/api/receipts", provider: false,
    async handler(c) {
      const limit = Math.max(1, Math.min(100, Number(c.q("limit")) || 20));
      const op = c.q("op") || null;
      if (op && !/^[a-z][a-z0-9-]{1,40}$/.test(op)) return c.send(400, { error: "op không hợp lệ" });
      return { receipts: await listRows(dirOf(c, c.q("name")), { op, limit }) };
    },
  },
  {
    method: "GET", path: "/api/receipt", provider: false,
    async handler(c) {
      const r = await getReceipt(dirOf(c, c.q("name")), c.q("id"));
      return r ?? c.send(404, { error: "không có biên nhận này" });
    },
  },
  {
    method: "POST", path: "/api/media/check", provider: false,
    async handler(c) {
      const b = c.body ?? {};
      const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
      if (!Array.isArray(b.files) || b.files.some((f) => typeof f !== "string")) return c.send(400, { error: "files: mảng đường file trong dự án" });
      return checkMedia(dirOf(c, b.name), { files: b.files, expected: obj(b.expected), allow: obj(b.allow), actor: "human" });
    },
  },
];

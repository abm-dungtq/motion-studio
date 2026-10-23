// lib/agents/cli/agy.mjs — Antigravity CLI. Checked against 1.4.5:
//   agy --version                      → "1.4.5"
//   agy models                         → one "<id>\t<name>" line per model, then
//                                        "Fetching available models..."; no auth command, so a
//                                        model list means logged in (20 s timeout, cached 5 min)
//   agy -p <prompt> --output-format json [--json-schema <file>] [--add-dir <dir>] [--model <id>]
//                                      → {"status":"SUCCESS","response":"…", …}
// Reading images and making them are not documented: both are "unknown" until the popover's
// "Thử khả năng" proves them. The prompt names the files by absolute path inside --add-dir.
import { detectBin, exec, firstJson } from "../run.mjs";

const MODELS_TTL_MS = 5 * 60000;
let models = null; // { at, path, promise }

export const parseModels = (text) => String(text ?? "").split("\n").map((l) => l.trim()).filter((l) => /^[a-z0-9][\w.-]*\t/i.test(l)).map((l) => {
  const [id, name] = l.split("\t");
  return { id: id.trim(), name: (name ?? "").trim() || id.trim() };
});

function listModels(io) {
  if (models && models.path === io.bin && Date.now() - models.at < MODELS_TTL_MS) return models.promise;
  const promise = exec(io.bin, ["models"], { env: io.env, timeout: 20000 }).then((r) => (r.error ? { error: r.error, list: [] } : { error: r.code ? `exit ${r.code}` : null, list: r.code ? [] : parseModels(r.stdout) }));
  models = { at: Date.now(), path: io.bin, promise };
  return promise;
}

const result = (r) => {
  const j = firstJson(r.stdout);
  const ok = j && typeof j.response === "string";
  return { ...r, text: ok ? j.response : r.stdout, error: r.error ?? (j && j.status && j.status !== "SUCCESS" ? `agy: ${String(j.status).slice(0, 80)}` : null) };
};
const base = (req) => ["--output-format", "json", "--add-dir", req.cwd, ...(req.model ? ["--model", req.model] : [])];
const files = (req) => (req.images ?? []).map((f) => `${req.cwd}/${f}`).join(", ");

export default {
  id: "agy", label: "Antigravity (agy)", rank: 12, bins: ["agy"],
  caps: { text: "yes", vision: "unknown", image: "unknown" },
  detect: (io) => detectBin(["agy"], { env: io.env }),
  async auth(io) {
    const m = await listModels(io);
    // No list (timeout, offline, an error exit) tells nothing for sure: unknown, not logged out.
    if (!m.list.length) return { logged_in: null, method: null, models: [] };
    return { logged_in: true, method: `${m.list.length} model`, models: m.list.map((x) => x.id) };
  },
  run: {
    text: async (io, req) => result(await exec(io.bin, ["-p", req.prompt, ...base(req), ...(req.schemaFile ? ["--json-schema", req.schemaFile] : [])], { cwd: req.cwd, env: io.env, timeout: req.timeout })),
    vision: async (io, req) => result(await exec(io.bin, ["-p", `${req.prompt}\n\nẢnh cần xem (đọc từng file): ${files(req)}`, ...base(req), ...(req.schemaFile ? ["--json-schema", req.schemaFile] : [])], { cwd: req.cwd, env: io.env, timeout: req.timeout })),
    image: async (io, req) => result(await exec(io.bin, ["-p", `Generate ONE image with your image generation tool. ${req.prompt}${req.size ? ` Size about ${req.size}.` : ""}${req.images?.length ? ` Reference images: ${files(req)}.` : ""} Save it as a PNG file at ${req.cwd}/${req.outName}. Reply only with the file path, or the exact refusal reason.`, ...base(req), "--mode", "accept-edits"], { cwd: req.cwd, env: io.env, timeout: req.timeout })),
  },
};

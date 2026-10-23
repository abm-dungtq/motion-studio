// lib/agents/cli/codex.mjs — OpenAI Codex CLI. Checked against codex-cli 0.163.0:
//   codex --version                     → "codex-cli 0.163.0"
//   codex login status                  → "Logged in using ChatGPT" | "… API key" (on stderr)
//   codex exec --skip-git-repo-check -C <dir> [-i <file>]… -o <f> [-m <model>] -
//     prompt on stdin ("-"): with -i and the prompt as an argument, Codex takes the prompt for
//     one more image path. -o writes the last message to a file.
// Image generation goes through Codex's image tool: the prompt asks for ONE image saved as a
// PNG in the run folder (-C), and the router picks up the newest PNG there.
// codexRun() is shared with codex-pool, which takes the same exec arguments.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { detectBin, exec } from "../run.mjs";

export const LAST = ".last-message.txt";

export function imagePrompt({ prompt, outName, edit, size }) {
  const sz = size ? ` Output size about ${size}.` : "";
  return edit
    ? `Use your image generation tool in EDIT mode on the attached image. ${prompt}${sz} Save the PNG in the current directory as ${outName}. Reply only with the file path, or the exact refusal reason.`
    : `Use your image generation tool to create ONE image. ${prompt}${sz} Save the PNG in the current directory as ${outName}. Reply only with the file path, or the exact refusal reason.`;
}

const lastMessage = (dir, r) => { try { return readFileSync(join(dir, LAST), "utf8"); } catch { return r.stdout; } };

// The run part of a Codex-like CLI: argv(io, rest) → [cmd, args] runs `… exec <rest>`.
export function codexRun(argv) {
  const go = async (io, req, extra, stdin) => {
    const [cmd, args] = argv(io, ["exec", "--skip-git-repo-check", "-C", req.cwd, ...extra, "-o", join(req.cwd, LAST), ...(req.model ? ["-m", req.model] : []), "-"]);
    const r = await exec(cmd, args, { stdin, cwd: req.cwd, env: io.env, timeout: req.timeout });
    return { ...r, text: lastMessage(req.cwd, r) };
  };
  const imgs = (req) => (req.images ?? []).flatMap((f) => ["-i", f]);
  return {
    // No --output-schema: it wants a strict schema (every property required, no extras), which
    // callers' schemas need not be; the prompt carries the schema instead.
    text: (io, req) => go(io, req, [], req.prompt),
    vision: (io, req) => go(io, req, imgs(req), req.prompt),
    image: (io, req) => go(io, req, imgs(req), imagePrompt(req)),
  };
}

export async function codexLogin(io, bin) {
  const r = await exec(bin, ["login", "status"], { env: io.env, timeout: 10000 });
  if (r.error) return { logged_in: null, method: null };
  const out = `${r.stdout}\n${r.stderr}`;
  if (/not logged in/i.test(out)) return { logged_in: false, method: null };
  if (/logged in/i.test(out)) return { logged_in: true, method: /api key/i.test(out) ? "API key" : /chatgpt/i.test(out) ? "ChatGPT" : null };
  return { logged_in: r.code === 0 ? null : false, method: null };
}

export default {
  id: "codex", label: "Codex CLI", rank: 20, bins: ["codex"],
  caps: { text: "yes", vision: "yes", image: "yes" },
  detect: (io) => detectBin(["codex"], { env: io.env }),
  auth: (io) => codexLogin(io, io.bin),
  run: codexRun((io, rest) => [io.bin, rest]),
};

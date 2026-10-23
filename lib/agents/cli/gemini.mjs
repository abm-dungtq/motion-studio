// lib/agents/cli/gemini.mjs — Google Gemini CLI. Not on the machine this was written on, so the
// calls are the documented ones and unverified here:
//   gemini --version
//   gemini -p <prompt> --output-format json   → { response, … }; files are attached as @<path>
// Login: ~/.gemini/oauth_creds.json exists, or GEMINI_API_KEY is set. Only existence is checked;
// neither is read.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { detectBin, exec, firstJson } from "../run.mjs";

const result = (r) => {
  const j = firstJson(r.stdout);
  return { ...r, text: typeof j?.response === "string" ? j.response : r.stdout };
};
const run = (io, req, prompt) => exec(io.bin, ["-p", prompt, "--output-format", "json", ...(req.model ? ["-m", req.model] : [])], { cwd: req.cwd, env: io.env, timeout: req.timeout }).then(result);

export default {
  id: "gemini", label: "Gemini CLI", rank: 30, bins: ["gemini"],
  caps: { text: "yes", vision: "yes", image: "unknown" },
  detect: (io) => detectBin(["gemini"], { env: io.env }),
  async auth(io) {
    const home = io.env.HOME || homedir();
    if (existsSync(join(home, ".gemini", "oauth_creds.json"))) return { logged_in: true, method: "OAuth" };
    if (String(io.env.GEMINI_API_KEY ?? "").trim()) return { logged_in: true, method: "API key" };
    return { logged_in: null, method: null };
  },
  run: {
    text: (io, req) => run(io, req, req.prompt),
    vision: (io, req) => run(io, req, `${req.prompt}\n\n${(req.images ?? []).map((f) => `@${f}`).join(" ")}`),
    image: (io, req) => run(io, req, `Generate ONE image. ${req.prompt} Save it as a PNG file named ${req.outName} in the current directory. Reply only with the file path, or the exact refusal reason.`),
  },
};

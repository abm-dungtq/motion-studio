// lib/agents/cli/detect-only.mjs — CLIs Studio only lists: found or not, and the version their
// --version prints. No login check, no runs (caps all "unknown", never picked by the router
// unless studio.json agents.order names them, and then only after "Thử khả năng").
// cx-image-generate is a script that calls an image API with a key from the Keychain: it is only
// looked up on PATH, never run, and its config file is never read.
import { detectBin } from "../run.mjs";

const only = (id, label, rank, { run = true } = {}) => ({
  id, label, rank, bins: [id], detectOnly: true,
  caps: { text: "unknown", vision: "unknown", image: "unknown" },
  detect: (io) => detectBin([id], { env: io.env, run }),
  auth: async () => ({ logged_in: null, method: null }),
  run: {},
});

export default [
  only("goose", "Goose", 60),
  only("devin", "Devin", 61),
  only("grok", "Grok CLI", 62),
  only("pi", "pi", 63),
  only("omp", "omp", 64),
  only("openclaw", "OpenClaw", 65),
  only("hermes", "Hermes", 66),
  only("cx-image-generate", "cx-image-generate", 67, { run: false }),
];

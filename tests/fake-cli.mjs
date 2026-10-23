// Fake agent CLIs for tests: small #!/bin/sh scripts in a temp folder that print sample output.
// fakeAgents() returns { dir, env, log, rm }: env has MOTION_STUDIO_AGENT_PATH = the folder plus
// /usr/bin:/bin (so the registry sees only these CLIs), its own state file and HOME, and the
// FAKE_* switches the scripts read. Every call appends "<cli> <args> | stdin=<stdin>" to log.
//   FAKE_POOL=ok|exhausted   codex-pool status sample
//   FAKE_IMAGE=write|none|quota|refuse|hang|json   what `exec` of codex/codex-pool does
//   FAKE_AGY=ok|quota        what agy -p answers
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A 1x1 PNG.
export const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const head = (name) => `#!/bin/sh
LOG="$FAKE_LOG"
IN=""
if [ ! -t 0 ]; then IN=$(cat 2>/dev/null); fi
printf '%s %s | stdin=%s\\n' "${name}" "$*" "$IN" >> "$LOG"
`;

// The exec part shared by codex and codex-pool: find -C <dir>, then act on FAKE_IMAGE.
const execBody = `
DIR=""; LAST=""
while [ $# -gt 0 ]; do
  case "$1" in
    -C) DIR="$2"; shift 2;;
    -o) LAST="$2"; shift 2;;
    *) shift;;
  esac
done
case "$FAKE_IMAGE" in
  quota) echo "ERROR: You've hit your usage limit." >&2; exit 1;;
  refuse) echo "I can't generate that image because it violates the content policy." > "$LAST"; echo "I can't generate that image."; exit 0;;
  hang) sleep 30; exit 0;;
  none) echo "done" > "$LAST"; exit 0;;
  json) echo '{"color":"red","n":2}' > "$LAST"; echo ok; exit 0;;
  *) printf '%s' "$FAKE_PNG" | base64 -d > "$DIR/out.png"; echo "$DIR/out.png" > "$LAST"; echo "$DIR/out.png"; exit 0;;
esac
`;

const SCRIPTS = {
  claude: `${head("claude")}
case "$1" in
  --version) echo "2.1.304 (Claude Code)";;
  auth) echo '{"loggedIn": true, "authMethod": "sk-ant-fakefakefakefake1234", "email": "someone@example.com", "orgName": "Org"}';;
  -p) echo '{"type":"result","is_error":false,"result":"{\\"color\\":\\"red\\"}"}';;
esac
`,
  codex: `${head("codex")}
case "$1" in
  --version) echo "codex-cli 0.163.0";;
  login) echo "Logged in using ChatGPT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl" >&2;;
  exec) shift; ${execBody};;
esac
`,
  "codex-pool": `${head("codex-pool")}
case "$1" in
  status)
    if [ "$FAKE_POOL" = "exhausted" ]; then
      echo "acct1: SKIP exhausted until 24/10 03:00; 5h 100% (reset 24/10 03:00); week 40% (reset 29/10 10:36)"
      echo "acct2: SKIP no login; no usage data yet"
      echo "pin=auto -> next: none available"
    else
      echo "acct1: OK   ok; 5h 38% (reset 22/10 20:47); week 12% (reset 29/10 10:36)"
      echo "acct2: OK   ok; no usage data yet"
      echo "pin=auto -> next: acct2"
    fi;;
  exec) shift; ${execBody};;
esac
`,
  agy: `${head("agy")}
case "$1" in
  --version) echo "1.4.5";;
  models) printf 'gemini-4-argon-medium\\tGemini 4 Argon (Medium)\\nclaude-opus-5-5-low\\tClaude Opus 5.5 (Low)\\nFetching available models...\\n';;
  -p)
    if [ "$FAKE_AGY" = "quota" ]; then echo '{"status":"ERROR","response":"quota exceeded for this account"}'; exit 1; fi
    echo '{"status":"SUCCESS","response":"OK from agy"}';;
esac
`,
  opencode: `${head("opencode")}
case "$1" in
  --version) echo "opencode v2.0.32";;
  auth) echo "OpenCode Console  Default                     stored"; echo "Other  me@example.com  stored";;
  run) echo "opencode answer";;
esac
`,
};

export function fakeAgents({ only = Object.keys(SCRIPTS), broken = [], slow = [], vars = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ms-fake-cli-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of only) {
    const f = join(bin, name);
    writeFileSync(f, SCRIPTS[name]);
    chmodSync(f, 0o755);
  }
  // A shim whose file is gone (like a removed install), and a dangling symlink.
  for (const name of broken) {
    const f = join(bin, name);
    writeFileSync(f, `#!/bin/sh\nexec ${join(dir, "gone", name)} "$@"\n`);
    chmodSync(f, 0o755);
  }
  // A CLI that never answers --version.
  for (const name of slow) {
    const f = join(bin, name);
    writeFileSync(f, "#!/bin/sh\nsleep 30\n");
    chmodSync(f, 0o755);
  }
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const env = {
    PATH: "/usr/bin:/bin", HOME: dir, MOTION_STUDIO_AGENT_PATH: `${bin}:/usr/bin:/bin`, MOTION_STUDIO_STATE: join(dir, "studio.json"),
    FAKE_LOG: log, FAKE_PNG: PNG_1PX, FAKE_POOL: "ok", FAKE_IMAGE: "write", FAKE_AGY: "ok", ...vars,
  };
  return { dir, bin, env, log, calls: () => readFileSync(log, "utf8"), rm: () => rmSync(dir, { recursive: true, force: true }), link: (name, to) => symlinkSync(to, join(bin, name)) };
}

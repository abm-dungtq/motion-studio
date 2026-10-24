// Fake agent CLIs for tests: small #!/bin/sh scripts in a temp folder that print sample output.
// fakeAgents() returns { dir, env, log, rm }: env has MOTION_STUDIO_AGENT_PATH = the folder plus
// /usr/bin:/bin (so the registry sees only these CLIs), its own state file and HOME, and the
// FAKE_* switches the scripts read. Every call appends "<cli> <args> | stdin=<stdin>" to log.
//   FAKE_POOL=ok|one|exhausted   codex-pool status sample (one: only acct1 can run)
//   FAKE_POOL_CREDITS="<n1> <n2>"  codex-pool accounts with that many image runs left each (reading
//                            an image costs nothing here): a drawing
//                            takes acct1 while it has credits, then switches to acct2 (one
//                            "out of credits, switching" line on stderr, like the real script),
//                            and fails with "out of credits" when both are spent; status follows.
//                            Plain codex spends the same accounts (they are the same logins).
//   FAKE_IMAGE=write|none|quota|refuse|hang|json   what `exec` of codex/codex-pool does
//   FAKE_DELAY=<s>           exec sleeps that long first and logs "end <cli>" when done
//   FAKE_AGY=ok|quota|check  what agy -p answers; check: the image check JSON of the asset batch,
//                            failing (FAKE_AGY_FAIL_KEY false, default no_text) for the first
//                            FAKE_AGY_FAILS calls
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A 1x1 PNG.
export const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const head = (name) => `#!/bin/sh
LOG="$FAKE_LOG"
LOCKD="$FAKE_LOG.lock"
lock() { while ! mkdir "$LOCKD" 2>/dev/null; do sleep 0.01; done; }
unlock() { rmdir "$LOCKD" 2>/dev/null; }
# count <file>: adds one to the number in file and prints the number before.
count() { N=$(cat "$1" 2>/dev/null || echo 0); echo $((N + 1)) > "$1"; echo "$N"; }
IN=""
if [ ! -t 0 ]; then IN=$(cat 2>/dev/null); fi
printf '%s %s | stdin=%s\\n' "${name}" "$*" "$IN" >> "$LOG"
`;

// codex-pool accounts with credits (FAKE_POOL_CREDITS): spend one, or fail when none is left.
const credits = `
case "$IN" in "Use your image generation tool"*) DRAW=1;; *) DRAW="";; esac
if [ -n "$FAKE_POOL_CREDITS" ] && [ "$FAKE_IMAGE" = "write" ] && [ -n "$DRAW" ]; then
  set -- $FAKE_POOL_CREDITS
  lock
  U1=$(cat "$LOG.acct1" 2>/dev/null || echo 0); U2=$(cat "$LOG.acct2" 2>/dev/null || echo 0)
  if [ "$U1" -lt "$1" ]; then echo $((U1 + 1)) > "$LOG.acct1"
  elif [ "$U2" -lt "$2" ]; then echo $((U2 + 1)) > "$LOG.acct2"; echo "acct1: out of credits, switching to acct2" >&2
  else unlock; echo "ERROR: acct1 and acct2 are out of credits" >&2; exit 1
  fi
  unlock
fi
`;
const poolStatus = `
if [ -n "$FAKE_POOL_CREDITS" ]; then
  set -- $FAKE_POOL_CREDITS
  U1=$(cat "$LOG.acct1" 2>/dev/null || echo 0); U2=$(cat "$LOG.acct2" 2>/dev/null || echo 0)
  if [ "$U1" -lt "$1" ]; then echo "acct1: OK   ok; 5h 40% (reset 22/10 20:47); week 12% (reset 29/10 10:36)"; else echo "acct1: SKIP exhausted until 24/10 03:00; 5h 100% (reset 24/10 03:00); week 40% (reset 29/10 10:36)"; fi
  if [ "$U2" -lt "$2" ]; then echo "acct2: OK   ok; 5h 10% (reset 22/10 21:00); week 5% (reset 29/10 10:36)"; else echo "acct2: SKIP exhausted until 24/10 04:00; 5h 100% (reset 24/10 04:00); week 30% (reset 29/10 10:36)"; fi
  exit 0
fi
`;

// The exec part shared by codex and codex-pool: find -C <dir>, then act on FAKE_IMAGE.
const execBody = (name, extra = "") => `
DIR=""; LAST=""
while [ $# -gt 0 ]; do
  case "$1" in
    -C) DIR="$2"; shift 2;;
    -o) LAST="$2"; shift 2;;
    *) shift;;
  esac
done
if [ -n "$FAKE_DELAY" ]; then sleep "$FAKE_DELAY"; fi
${extra}
if [ -n "$FAKE_DELAY" ]; then printf 'end %s\\n' "${name}" >> "$LOG"; fi
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
  exec) shift; ${execBody("codex", credits)};;
esac
`,
  "codex-pool": `${head("codex-pool")}
case "$1" in
  status)
    ${poolStatus}
    if [ "$FAKE_POOL" = "exhausted" ]; then
      echo "acct1: SKIP exhausted until 24/10 03:00; 5h 100% (reset 24/10 03:00); week 40% (reset 29/10 10:36)"
      echo "acct2: SKIP no login; no usage data yet"
      echo "pin=auto -> next: none available"
    elif [ "$FAKE_POOL" = "one" ]; then
      echo "acct1: OK   ok; 5h 38% (reset 22/10 20:47); week 12% (reset 29/10 10:36)"
      echo "acct2: SKIP no login; no usage data yet"
      echo "pin=auto -> next: acct1"
    else
      echo "acct1: OK   ok; 5h 38% (reset 22/10 20:47); week 12% (reset 29/10 10:36)"
      echo "acct2: OK   ok; no usage data yet"
      echo "pin=auto -> next: acct2"
    fi;;
  exec) shift; ${execBody("codex-pool", credits)};;
esac
`,
  agy: `${head("agy")}
case "$1" in
  --version) echo "1.4.5";;
  models) printf 'gemini-4-argon-medium\\tGemini 4 Argon (Medium)\\nclaude-opus-5-5-low\\tClaude Opus 5.5 (Low)\\nFetching available models...\\n';;
  -p)
    if [ "$FAKE_AGY" = "quota" ]; then echo '{"status":"ERROR","response":"quota exceeded for this account"}'; exit 1; fi
    if [ "$FAKE_AGY" = "check" ]; then
      lock; N=$(count "$LOG.agy"); unlock
      if [ "$N" -lt "\${FAKE_AGY_FAILS:-0}" ]; then
        K="\${FAKE_AGY_FAIL_KEY:-no_text}"; T=true; [ "$K" = right_character ] && R=false || R=true; [ "$K" = single_figure ] && S1=false || S1=true; [ "$K" = flat_green ] && G=false || G=true; [ "$K" = no_text ] && T=false
        echo '{"status":"SUCCESS","response":"{\\"right_character\\":'$R',\\"single_figure\\":'$S1',\\"flat_green\\":'$G',\\"no_text\\":'$T',\\"note\\":\\"có chữ ở góc\\"}"}'
      else
        echo '{"status":"SUCCESS","response":"{\\"right_character\\":true,\\"single_figure\\":true,\\"flat_green\\":true,\\"no_text\\":true,\\"note\\":\\"\\"}"}'
      fi
      exit 0
    fi
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

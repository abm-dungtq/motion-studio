// lib/agents/redact.mjs — masks secrets in CLI output before it reaches a job log, a receipt or
// the API. Patterns: OpenAI/Anthropic style keys (sk-…), JWTs (eyJ…), Google OAuth tokens
// (ya29.…), GitHub tokens (gh[pousr]_…), "Bearer <token>", and a 32+ character hex or base64 run
// right after a word like token, key, secret or auth. E-mail addresses are masked too, so an
// account name never shows in the UI.
export const MASK = "<đã che>";
const PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g,
  /\bya29\.[A-Za-z0-9_-]{10,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
];
// token=…, "api_key": "…", secret: … — the value only, the name stays readable.
const NAMED = /((?:token|key|secret|auth)[A-Za-z_-]*["']?\s*[:=]\s*["']?)([A-Fa-f0-9]{32,}|[A-Za-z0-9+/_-]{32,}={0,2})/gi;

export function redact(text) {
  if (text == null) return text;
  let s = String(text);
  for (const re of PATTERNS) s = s.replace(re, MASK);
  return s.replace(NAMED, (_, name) => `${name}${MASK}`);
}

// redact() over every string of a JSON-like value (objects and arrays copied).
export function redactDeep(v) {
  if (typeof v === "string") return redact(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)]));
  return v;
}

// Shapes of the server answers the UI reads, taken from a live test Studio (make-test-root.mjs
// projects) and from the server code. Fields the UI does not rely on yet stay unknown; the index
// signatures keep fields the server adds without breaking the types.
import type { Line as CoreLine, Manifest as CoreManifest, MusicBed, SfxEvent, Shot as CoreShot } from "@/core/timeline-edit.ts";

// GET /api/projects
export interface ProjectEntry { name: string; title: string; has_manifest: boolean; editable: boolean; version: number | null }

// GET /api/status (server.mjs:346): ok, or why there is no provider and the command that fixes it.
export interface StatusResponse { ok: boolean; error?: string; setup?: string; provider?: { id: string; label: string; version?: string; api?: number } }

// GET /api/project: project.json as the gateway loads it.
export interface Shot extends CoreShot { name?: string; transition_in?: string; motion_note?: string; assets?: string[]; [k: string]: unknown }
export interface Line extends CoreLine { text?: string; file?: string; gate?: string; duration?: number | null; [k: string]: unknown }
export interface Music extends MusicBed { file?: string; gain?: number; [k: string]: unknown }
export interface SfxEventFull extends SfxEvent { sound?: string; label?: string; studio?: boolean; [k: string]: unknown }
export interface Manifest extends CoreManifest {
  schema?: unknown;
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
  duration?: number;
  html?: string;
  capabilities?: { editable?: boolean; timing_markers?: boolean; [k: string]: unknown };
  shots: Shot[];
  lines: Line[];
  music?: Music[];
  events?: SfxEventFull[];
  assets?: unknown;
  version: number;
  updated?: string;
  [k: string]: unknown;
}

// GET /api/log: the edit history, oldest first.
export interface LogEntry { v: number; at?: string; actor?: string; base?: number; ops?: unknown[]; receipt?: string[]; note?: string; [k: string]: unknown }

// GET /api/requests: director requests, oldest first.
export interface DirectorAsk { question?: string; at?: string | number | null; kind?: string; [k: string]: unknown }
export interface DirectorRequest {
  id: string;
  at?: string;
  scope?: "project" | "shot" | "line" | string;
  target?: string | null;
  t?: number | null;
  base?: number;
  text?: string;
  status: "queued" | "running" | "waiting_user" | "done" | "failed" | string;
  runner?: string;
  session?: string | null;
  receipt?: string | null;
  error?: string | null;
  follows?: string | null;
  started?: string | null;
  finished?: string | null;
  ask?: DirectorAsk | null;
  decision?: { value?: string; [k: string]: unknown } | null;
  [k: string]: unknown;
}

// GET /api/jobs and the SSE "job" event (jobs.mjs view()).
export interface Job {
  id: string;
  name: string;
  kind: string;
  meta?: { step?: string; output?: string; message?: string; request?: string; [k: string]: unknown } | null;
  status: "running" | "done" | "failed" | "cancelled" | "cancelling" | string;
  code: number | null;
  signal?: string | null;
  started: string;
  ended?: string | null;
  tail?: string[];
  [k: string]: unknown;
}
export interface JobEvent { type: "start" | "log" | "exit"; job: Job; line?: string }

// GET /api/gates, normalised as app.js refreshGates did.
export interface Gates { pass: boolean; fails: string[]; animatic: boolean }

// GET /api/timeline/media: the newest render (renders/ or demo/) and the stamps of the audio files.
export interface FileStamp { size: number; mtime: number }
export interface TimelineMedia { render: { path: string; mtime: number; size: number; stale: boolean } | null; files: Record<string, FileStamp> }

// GET /api/agent
export interface AgentStatus {
  claude: { found: boolean; version?: string | null; logged_in?: boolean | null };
  runner?: "mcp" | "cli" | string;
  last_job?: { status: string; code?: number | null; started?: string } | null;
  ffprobe?: boolean;
  ffmpeg?: boolean;
  provider: { id: string; label: string; version?: string | null } | null;
  provider_error?: { error?: string; hint?: string } | null;
  agents?: AgentCli[] | null;
  [k: string]: unknown;
}

// GET /api/agents (lib/agents): the CLI registry scan.
export interface AgentCli { id: string; label: string; found?: boolean; error?: string | null; detect_only?: boolean; version?: string | null; logged_in?: boolean | null; caps?: Record<string, string>; [k: string]: unknown }
export interface AgentsScan { agents: AgentCli[]; order?: Record<string, string[]>; probe?: { status?: string; [k: string]: unknown } | null; at?: string; [k: string]: unknown }

// GET /api/sounds: sound files of the project and of shared-assets/sfx.
export interface SoundsList { project?: { path: string; [k: string]: unknown }[]; shared?: { file: string; [k: string]: unknown }[] }

// GET /api/media, /api/files, /api/media/browse
export interface MediaEntry { rel?: string | null; path?: string | null; kind?: string | null; duration?: number; width?: number; height?: number; [k: string]: unknown }
export interface FileEntry { path: string; size?: number; mtime?: number | string; [k: string]: unknown }
// The other GET routes (library, broll, fx, lemo, anime, receipts) answer unknown: the area that
// reads one narrows it where it uses it.

// The stored suggestion (lib/suggest.mjs): each side ranks directions, styles and a way of working.
// score is Jev's 0–4 (null on the deterministic side); fields name the BRIEF fields behind reason.
export interface SuggestItem { id: string; label: string; score: number | null; confidence: number | null; reason: string; source: "jev" | "det"; fields?: string[]; directions?: string[] }
export interface SuggestWorkflow { mode: string; label: string; pitch: boolean; steps: string[]; skip: { step: string; reason: string }[]; reason: string; source: "jev" | "det"; p?: number | null }
export interface SuggestSide { directions: SuggestItem[]; styles: SuggestItem[]; workflow: SuggestWorkflow }
export interface SuggestRecord {
  v: number; at: string; project: string; hash: string;
  source: "deterministic" | "observe" | "jev"; shown: "jev" | "det";
  error: { code: string; message: string } | null;
  det: SuggestSide; jev: SuggestSide | null; ms: number; questions: number;
}
// GET and POST /api/suggest (routes/suggest.mjs): the record, the rows of pitch/PICK.json and what
// the provider can do.
export interface SuggestPick { n: number; id: string; style_profile: string | null; dir: string | null }
export interface SuggestResponse {
  record: SuggestRecord | null; picks: SuggestPick[] | null; source: SuggestRecord["source"]; source_setting: string | null;
  modes: { id: string; label: string }[]; can_save_mode: boolean; can_init_pitch: boolean;
}
// POST /api/suggest/choose (routes/suggest.mjs): one of three outcomes.
export interface SuggestMode { saved: boolean; reason: string | null }
export type SuggestChooseResult =
  | { outcome: "chosen"; direction: string; pick: number; style: string | null; requested_style?: string; answered?: string | null; next?: unknown; initialized?: boolean; mode: SuggestMode }
  | { outcome: "not_in_pitch"; picks: SuggestPick[]; mode: SuggestMode }
  | { outcome: "queued"; request?: unknown; runner?: unknown; job?: unknown; mode: SuggestMode };

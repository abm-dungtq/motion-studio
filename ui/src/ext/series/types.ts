// What the series and asset routes answer (routes/series.mjs, routes/assets.mjs,
// routes/consent.mjs; docs/series.md, docs/assets.md), narrowed for the Tài sản tab.

// GET /api/series?name=: the project's series (describeSeries).
export interface SeriesInfo {
  name: string;
  dir: string;
  characters: string[];
  roles: string[];
  writable: string[];
}

export type AssetKind = "pose" | "background" | "prop" | "ui-card" | "thumbnail";
export type AssetStatus = "new" | "queued" | "drawing" | "checking" | "keying" | "keyed" | "ready" | "needs_review" | "failed" | "waiting_quota" | "interrupted" | "approved";

// One image of a batch: the batch file's item with its state (batchStatus of lib/assets/batch.mjs).
export interface AssetItem {
  id: string;
  kind: AssetKind;
  character: string | null;
  target: string | null;
  status: AssetStatus;
  raw?: string | null;
  keyed?: string | null;
  preview?: string | null;
  reasons?: string[];
  error?: string | null;
  // The self-check could not read the image (not a failed check): it waits on the board, not redrawn.
  unchecked?: boolean;
  updated?: string;
}

// A consent card (.opus/consent/<id>.json); shared by every paid step, not only image batches.
export interface QuotaAccount { name: string; ok?: boolean; h5?: number | null; reset_h5?: string | null }
export interface ConsentCardData {
  id: string;
  kind: "codex" | "elevenlabs" | "drive" | string;
  title: string;
  count?: number | null;
  estimate?: { images?: number; codex_turns?: number; codex_max?: number; agent?: string | null; [k: string]: unknown } | null;
  quota?: { accounts?: QuotaAccount[] } | null;
  status: "waiting" | "approved" | "declined" | string;
  error?: string | null;
}

// GET /api/voice/previews?name=: roles waiting for the user to pick one of their previews (file is
// a project path), and whether the provider can set a line's speaker.
export interface VoicePreview { n: number; file: string }
export interface VoiceRolePreviews { role: string; name: string; previews: VoicePreview[] }
export interface VoicePreviews { roles: VoiceRolePreviews[]; can_set_speaker: boolean }

export interface BatchView {
  batch: string;
  running: boolean;
  stopped?: boolean;
  // Cut short (job killed, Studio stopped): drawn images kept; can_resume when the batch file is
  // still the one the card approved and no job runs, so Chạy tiếp needs no new card.
  interrupted?: boolean;
  can_resume?: boolean;
  message?: string | null;
  error?: string;
  items: AssetItem[];
  consent: ConsentCardData | null;
  job: { id: string; status: string; started: string } | null;
}

// GET /api/assets?name=
export interface AssetsList { series: string; batches: BatchView[] }

// A board of the tab: a character sheet (poses of one character), the backgrounds or the props.
export type BoardKey = `character:${string}` | "background" | "prop";
export interface BoardItem extends AssetItem { batch: string }
export interface BoardData { key: BoardKey; title: string; zoom: Zoom; items: BoardItem[] }

export type Zoom = 2 | 4 | 8;

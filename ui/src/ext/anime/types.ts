// Port of public/ext-anime.js; behaviour unchanged.
// What the anime routes answer (routes/anime.mjs, lib/anime/*). queries.ts types them unknown;
// this area narrows them here.
import type { Job } from "@/api/types.ts";

export type ShotStatus = "missing" | "plate" | "variants" | "animated";

export interface BoardShot {
  id: string;
  name?: string | null;
  start: number;
  end?: number;
  thumb?: string | null;
  plates: string[];
  variants: string[];
  stacks: string[];
  tracks: number;
  status: ShotStatus;
}
export interface BoardChar { id: string; name: string; exists?: boolean }
export interface Board {
  source?: string;
  note?: string | null;
  columns: { id: ShotStatus; label: string }[];
  shots: BoardShot[];
  chars: BoardChar[];
}

export interface Char {
  id: string;
  name: string;
  sheet?: string | null;
  key_color: string;
  palette?: string[];
  notes?: string;
  exists?: boolean;
  unregistered?: boolean;
}
export interface CharsList { chars: Char[] }

// The manifest is free-form JSON: a stack carries keys this editor has no form for (tweens, smears,
// tremor, ...) and they must pass through untouched, so its values stay loose on purpose.
export type Loose = Record<string, any>; // loose: free-form manifest JSON, see above
export interface Track extends Loose { type: string }
export interface Offset { x?: number; y?: number; scale?: number }
export interface Stack extends Loose { shot: string; tracks?: Track[]; offsets?: Record<string, Offset> }
export interface Impact extends Loose { at?: number | string; frames?: number; mode?: string; stack?: string }
export interface AnimManifest extends Loose { stacks: Record<string, Stack>; impacts: Impact[] }

export interface ManifestInfo {
  exists: boolean;
  enabled: boolean;
  manifest: AnimManifest | null;
  sha: string | null;
  final: string[];
  backups?: unknown[];
}

// GET /api/anime/job: the job, its whole log and (for builds) the WARN lines.
export interface JobView { job: Job; log?: string[]; warnings?: string[] }

export const isLive = (job: Job | undefined | null): boolean => job?.status === "running" || job?.status === "cancelling";

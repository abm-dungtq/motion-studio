// Port of public/ext-anime.js; behaviour unchanged.
// The state the three views of the Anime tab share (the old `A` object): the open sub-tab, the
// picked shot and its variant form, the character form, the manifest draft and the followed jobs.
// It lives outside React and outside the query cache, so switching rail tabs or a query reload never
// drops what is being typed. A new project resets everything but the sub-tab, as the old sync() did.
import { create } from "zustand";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import type { Job } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import type { AnimManifest, ManifestInfo } from "./types.ts";

export type Sub = "board" | "chars" | "anim";
export const SUBS: readonly [Sub, string][] = [["board", "Shot board"], ["chars", "Nhân vật"], ["anim", "Hoạt hình"]];
export type Slot = "variant" | "sheet" | "build";

export interface VariantForm {
  base: string; chars: string[]; kind: "edit" | "pose"; change: string; out_name: string;
  sim: string | number; blend: string | number; edge: boolean;
}
export interface CharForm { id: string; name: string; key_color: string; palette: string; notes: string; sheet: string }
export interface Draft { sha: string | null; m: AnimManifest; stack: string | null; rawErr: string | null }
// A followed job: the job the POST answered, when following began, a label for the end toast.
export interface JobRef { id: string; job: Job; t0: number; label?: string; ended: boolean }

export const DEFAULT_KEY = "#0047FF"; // token-exempt: màu khoá chroma của sheet nhân vật
export const blankChar = (): CharForm => ({ id: "", name: "", key_color: DEFAULT_KEY, palette: "", notes: "", sheet: "" });

export function makeDraft(g: ManifestInfo): Draft {
  const m = structuredClone(g.manifest ?? { stacks: {}, impacts: [] }) as AnimManifest;
  m.stacks ??= {};
  m.impacts ??= [];
  return { sha: g.sha, m, stack: Object.keys(m.stacks)[0] ?? null, rawErr: null };
}

interface AnimeState {
  name: string | null;
  sub: Sub;
  pick: string | null;
  form: VariantForm | null;
  charForm: CharForm;
  descs: Record<string, string>;
  draft: Draft | null;
  jobs: Partial<Record<Slot, JobRef>>;

  setSub(s: Sub): void;
  pickShot(id: string): void;
  setForm(f: VariantForm): void;
  setCharForm(f: CharForm): void;
  setDesc(id: string, v: string): void;
  setDraft(d: Draft | null): void;
  // Changes a copy of the draft (made from g when there is none yet) and stores it.
  editDraft(fn: (d: Draft) => void, g?: ManifestInfo): void;
  follow(slot: Slot, job: Job, label?: string): void;
  ended(slot: Slot): void;
  reset(name: string | null): void;
}

const fresh = (name: string | null) => ({ name, pick: null, form: null, charForm: blankChar(), descs: {}, draft: null, jobs: {} });

export const useAnimeStore = create<AnimeState>()((set, get) => ({
  ...fresh(null),
  sub: "board",
  setSub: (sub) => set({ sub }),
  pickShot: (pick) => set({ pick, form: null }),
  setForm: (form) => set({ form }),
  setCharForm: (charForm) => set({ charForm }),
  setDesc: (id, v) => set({ descs: { ...get().descs, [id]: v } }),
  setDraft: (draft) => set({ draft }),
  editDraft(fn, g) {
    const cur = get().draft ?? (g ? makeDraft(g) : null);
    if (!cur) return;
    const d = structuredClone(cur);
    fn(d);
    set({ draft: d });
  },
  follow: (slot, job, label) => set({ jobs: { ...get().jobs, [slot]: { id: job.id, job, t0: Date.now(), label, ended: false } } }),
  ended(slot) {
    const j = get().jobs[slot];
    if (j && !j.ended) set({ jobs: { ...get().jobs, [slot]: { ...j, ended: true } } });
  },
  reset: (name) => set(fresh(name)),
}));

// The old A.load(what): reload some of board, chars, manifest of a project; resolves when reloaded.
export const reload = (name: string | null, ...what: ("board" | "chars" | "manifest")[]) =>
  Promise.all(what.map((k) => queryClient.invalidateQueries({ queryKey: keys.anime(k, name) })));

// A new project (or none) resets the tab; the same one keeps its drafts.
useAnimeStore.getState().reset(useStudio.getState().name);
useStudio.subscribe((s, prev) => {
  if (s.name !== prev.name && s.name !== useAnimeStore.getState().name) useAnimeStore.getState().reset(s.name);
});

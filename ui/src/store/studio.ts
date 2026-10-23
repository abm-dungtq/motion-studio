// The Studio's UI state (public/app.js:29-30, ctx.state minus the server data). Server data
// (projects, manifest, log, jobs, requests, gates) lives in the TanStack Query cache (api/), not
// here. State that belongs to one area lives in a small store inside that area's folder.
// The playhead t changes every frame while playing: read it with useStudio.subscribe or
// useStudio.getState().t, never with a render selector.
import { create, type StoreApi, type UseBoundStore } from "zustand";

export type PickKind = "shot" | "line" | "music" | "event" | "beat" | "word";
export type Pick = { kind: PickKind; id: string } | null;
export type RightTab = "director" | "shot";
export type EditMode = "ripple" | "roll";
export type AudioGroup = "voice" | "music" | "sfx" | "broll";
export type Dialog = "export" | "new-project" | "agent" | null;

export interface ProviderStatus { ok: boolean; error?: string; setup?: string }

export interface StudioState {
  name: string | null;                        // the open project (?name=)
  pick: Pick;                                 // the block shown in the inspector
  sel: string | null;                         // shot id of the picked block
  t: number;                                  // playhead, seconds. Read with useStudio.subscribe
  playing: boolean;
  leftTab: string; leftCollapsed: boolean;    // leftTab: id of a registered tab
  rightTab: RightTab; rightCollapsed: boolean;
  dialog: Dialog;
  snap: boolean;                              // default true (timeline.js:41)
  mode: EditMode;                             // default "ripple"
  pps: number;                                // default 60, clamped to 8..400
  audio: { mute: AudioGroup[]; solo: AudioGroup[] };
  retimed: boolean;                           // a marker moved, the voice was not redone yet
  directorDraft: string;                      // the director box text, kept across tabs
  providerStatus: ProviderStatus | null;

  setName(n: string | null): void;
  setPick(kind: PickKind, id: string, m?: unknown): void;
  setT(t: number): void; setPlaying(p: boolean): void;
  setLeftTab(id: string): void; toggleLeft(open?: boolean): void;
  setRightTab(t: RightTab): void; toggleRight(open?: boolean): void;
  openDialog(d: Dialog): void;
  setSnap(on: boolean): void; setMode(m: EditMode): void; setPps(p: number): void;
  toggleAudio(kind: "mute" | "solo", g: AudioGroup): void;
  setRetimed(r: boolean): void; setDirectorDraft(s: string): void;
}

export const TAB_STORE = "studio.tab";
export const PPS_MIN = 8;
export const PPS_MAX = 400;
export const clampPps = (p: number): number => Math.min(PPS_MAX, Math.max(PPS_MIN, Number(p) || 60));

// What setPick reads of a manifest: which shot a line or an SFX belongs to.
interface PickManifest { lines?: { id: string; shot: string }[]; events?: { id: string; shot: string }[] }

// The shot a picked block belongs to (ctx.pick, public/app.js:185-193). Music and beat keep sel.
export function selFor(kind: PickKind, id: string, m: unknown, sel: string | null): string | null {
  const man = (m && typeof m === "object" ? m : null) as PickManifest | null;
  if (kind === "shot") return id;
  if (kind === "line") return man?.lines?.find((l) => l.id === id)?.shot ?? sel;
  if (kind === "event") return man?.events?.find((e) => e.id === id)?.shot ?? sel;
  if (kind === "word") return man?.lines?.find((l) => l.id === String(id).split("#")[0])?.shot ?? sel;
  return sel;
}

// The left tab the URL (?tab=) or localStorage asked for (panels.js readTab). "ai" and "output"
// are not left tabs any more: App sends them to the director tab and the export dialog.
export function requestedTab(): string {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get("tab");
    if (fromUrl && fromUrl !== "ai" && fromUrl !== "output") return fromUrl;
    const saved = window.localStorage.getItem(TAB_STORE);
    if (saved && saved !== "ai" && saved !== "output") return saved;
  } catch { /* storage blocked */ }
  return "";
}

const flip = (list: AudioGroup[], g: AudioGroup): AudioGroup[] => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]);

export const useStudio: UseBoundStore<StoreApi<StudioState>> = create<StudioState>()((set, get) => ({
  name: null,
  pick: null,
  sel: null,
  t: 0,
  playing: false,
  leftTab: requestedTab(),
  leftCollapsed: false,
  rightTab: "director",
  rightCollapsed: false,
  dialog: null,
  snap: true,
  mode: "ripple",
  pps: 60,
  audio: { mute: [], solo: [] },
  retimed: false,
  directorDraft: "",
  providerStatus: null,

  setName: (name) => set({ name }),
  setPick: (kind, id, m) => set({ pick: { kind, id }, sel: selFor(kind, id, m, get().sel), rightTab: "shot" }),
  setT: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
  // Kept in localStorage and in the URL (?tab=), as panels.js select() did.
  setLeftTab: (id) => {
    if (id === get().leftTab) return;
    set({ leftTab: id });
    try { window.localStorage.setItem(TAB_STORE, id); } catch { /* storage blocked: the URL still keeps it */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(window.history.state, "", url);
    } catch { /* no history (tests) */ }
  },
  toggleLeft: (open) => set({ leftCollapsed: open === undefined ? !get().leftCollapsed : !open }),
  setRightTab: (rightTab) => set({ rightTab }),
  toggleRight: (open) => set({ rightCollapsed: open === undefined ? !get().rightCollapsed : !open }),
  openDialog: (dialog) => set({ dialog }),
  setSnap: (snap) => set({ snap }),
  setMode: (mode) => set({ mode }),
  setPps: (p) => set({ pps: clampPps(p) }),
  toggleAudio: (kind, g) => set({ audio: { ...get().audio, [kind]: flip(get().audio[kind], g) } }),
  setRetimed: (retimed) => set({ retimed }),
  setDirectorDraft: (directorDraft) => set({ directorDraft }),
}));

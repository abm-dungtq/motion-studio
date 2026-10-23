// Port of public/fx-gallery.js and public/fx-footage.js; behaviour unchanged.
// The area's own state, kept outside the components as the old module variables were: the
// gallery's search, source chip and picked card (one for the page), and each clip editor's form,
// running job and result by key ("media:<name>", "shot:<name>:<shot>"), so switching tabs or
// shots keeps the form and a running render.
import { create } from "zustand";
import { defaultForm, type ClipResult, type EditorForm } from "./clip-params.ts";

export interface EditorState {
  form: EditorForm;
  job: string | null;          // id of the running "fx" job
  until: number;               // when to give up waiting for it (ms since epoch)
  busy: boolean;
  result: ClipResult | null;
  error: string | null;
}

interface FxState {
  gallery: { q: string; source: string; picked: string | null };
  editors: Record<string, EditorState>;
  setGallery(p: Partial<FxState["gallery"]>): void;
  editor(key: string, src: string): EditorState;
  patchEditor(key: string, p: Partial<EditorState>): void;
  patchForm(key: string, p: Partial<EditorForm>): void;
}

const fresh = (src: string): EditorState => ({ form: defaultForm(src), job: null, until: 0, busy: false, result: null, error: null });

export const useFx = create<FxState>()((set, get) => ({
  gallery: { q: "", source: "", picked: null },
  editors: {},
  setGallery: (p) => set({ gallery: { ...get().gallery, ...p } }),
  editor: (key, src) => get().editors[key] ?? fresh(src),
  patchEditor: (key, p) => set({ editors: { ...get().editors, [key]: { ...(get().editors[key] ?? fresh("")), ...p } } }),
  patchForm: (key, p) => {
    const cur = get().editors[key] ?? fresh("");
    set({ editors: { ...get().editors, [key]: { ...cur, form: { ...cur.form, ...p } } } });
  },
}));

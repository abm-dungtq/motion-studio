// Port of the director part of the panel memo of public/panels.js:86 (reopen, rejecting, drafts);
// behaviour unchanged. What the director chat keeps across redraws and tab switches: questions
// reopened after they expired, approve cards with the reject note open, and the drafts of the
// card text fields (by request id, or "<id>:reject" for the reject note).
import { create } from "zustand";

interface DirectorMemo {
  reopen: ReadonlySet<string>;
  rejecting: ReadonlySet<string>;
  drafts: Readonly<Record<string, string>>;
  setReopen(id: string, on: boolean): void;
  setRejecting(id: string, on: boolean): void;
  setDraft(key: string, text: string): void;
  // After an answer went through: the card forgets its reopen, reject note and draft.
  answered(id: string): void;
}

const flip = (set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> => {
  if (set.has(id) === on) return set;
  const next = new Set(set);
  if (on) next.add(id); else next.delete(id);
  return next;
};

export const useDirectorMemo = create<DirectorMemo>()((set, get) => ({
  reopen: new Set(),
  rejecting: new Set(),
  drafts: {},
  setReopen: (id, on) => set({ reopen: flip(get().reopen, id, on) }),
  setRejecting: (id, on) => set({ rejecting: flip(get().rejecting, id, on) }),
  setDraft: (key, text) => set({ drafts: { ...get().drafts, [key]: text } }),
  answered: (id) => {
    const drafts = { ...get().drafts };
    delete drafts[id];
    set({ reopen: flip(get().reopen, id, false), rejecting: flip(get().rejecting, id, false), drafts });
  },
}));

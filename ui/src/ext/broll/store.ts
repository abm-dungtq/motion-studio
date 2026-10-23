// Port of public/broll-search.js; behaviour unchanged.
// What the old search panel and "Gợi ý B-roll" kept for the life of the page: the typed search,
// the search last sent (after the 250 ms debounce), the shot size, the analysis scope and the
// "Nhờ đạo diễn đặt clip vào cảnh" tick (ext-broll.js askDirector, on by default).
import { create } from "zustand";

export type Scope = "workspace" | "project";

export interface BrollState {
  q: string;          // the search box
  searched: string;   // the text of the search last sent
  kind: string;       // shot size, "" for every size
  scope: Scope;
  askDirector: boolean;
  setQ(q: string): void;
  setSearched(q: string): void;
  setKind(k: string): void;
  setScope(s: Scope): void;
  setAskDirector(on: boolean): void;
}

export const useBroll = create<BrollState>()((set) => ({
  q: "",
  searched: "",
  kind: "",
  scope: "workspace",
  askDirector: true,
  setQ: (q) => set({ q }),
  setSearched: (searched) => set({ searched }),
  setKind: (kind) => set({ kind }),
  setScope: (scope) => set({ scope }),
  setAskDirector: (askDirector) => set({ askDirector }),
}));

// Tests only.
export const resetBroll = (): void => useBroll.setState(useBroll.getInitialState(), true);

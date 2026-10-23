// Port of the library part of the panel memo of public/panels.js:84 (libMode, libQuery, libCat,
// libFeatured, libCats); behaviour unchanged. It outlives the tab, as the old memo outlived a redraw.
import { create } from "zustand";
import type { LibCategory, LibKind } from "@/core/library.ts";

export interface LibraryState {
  mode: LibKind;
  query: string;          // the search that ran (Enter or "Tìm")
  cat: string;            // "" is "Mọi thể loại"
  featured: boolean;
  cats: LibCategory[];    // from the first page that sent categories
  setMode(mode: LibKind): void;
  search(query: string): void;
  setCat(cat: string): void;
  setFeatured(on: boolean): void;
  setCats(cats: LibCategory[]): void;
  // An example of a scene or style: the video it names.
  showVideo(id: string): void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  mode: "videos",
  query: "",
  cat: "",
  featured: false,
  cats: [],
  setMode: (mode) => set({ mode, query: "" }),
  search: (query) => set({ query: query.trim() }),
  setCat: (cat) => set({ cat }),
  setFeatured: (featured) => set({ featured }),
  setCats: (cats) => set({ cats }),
  showVideo: (id) => set({ mode: "videos", query: id, cat: "", featured: false }),
}));

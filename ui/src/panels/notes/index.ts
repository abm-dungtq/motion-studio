// The user's notes on the timeline (routes/notes.mjs): their list sits at the top of the director
// tab (slot right.director). Key C (timeline/keys.ts) opens NoteInput; the ruler shows NoteMarks.
import type { Studio } from "@/ext/registry.ts";
import { NotesList } from "./NotesList.tsx";

export function register(studio: Studio): void {
  studio.registerSection("director", { id: "notes", order: 4, component: NotesList });
}

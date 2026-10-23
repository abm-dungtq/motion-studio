// The director tab of the right column (slot right.director): the suggest card above the chat,
// the chat with the director, its gate cards and the box for a new task (public/panels.js views.ai).
import type { Studio } from "@/ext/registry.ts";
import { DirectorChat } from "./DirectorChat.tsx";
import { SuggestCard } from "./SuggestCard.tsx";

export function register(studio: Studio): void {
  studio.registerSection("director", { id: "suggest", order: 5, component: SuggestCard });
  studio.registerSection("director", { id: "chat", order: 10, component: DirectorChat });
}

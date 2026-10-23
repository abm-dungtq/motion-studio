// The director tab of the right column (slot right.director): the chat with the director, its
// gate cards and the box for a new task (public/panels.js views.ai).
import type { Studio } from "@/ext/registry.ts";
import { DirectorChat } from "./DirectorChat.tsx";

export function register(studio: Studio): void {
  studio.registerSection("director", { id: "chat", order: 10, component: DirectorChat });
}

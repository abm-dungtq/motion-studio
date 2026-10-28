// Port of public/ext-anime.js; behaviour unchanged.
// The confirm() prompts of the old Anime views (quota, removing a character or a stack, saving over
// a final video) as one Dialog (shell/confirm.tsx).
import { makeConfirm } from "@/shell/confirm.tsx";

export const { ask, ConfirmHost } = makeConfirm();

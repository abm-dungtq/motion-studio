// lemo's in-page confirms (shell/confirm.tsx): window.confirm() is never shown in some hosts and
// answers "cancel", so applying or keeping a style did nothing. The "Phong cách" tab (gallery and
// own styles) and the shot inspector section can be on screen together: each has its own question
// and host, so one question never opens two dialogs.
import { makeConfirm } from "@/shell/confirm.tsx";

export const tabConfirm = makeConfirm();
export const shotConfirm = makeConfirm();

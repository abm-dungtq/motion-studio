// Text typed but not yet sent or saved, kept in sessionStorage under one key so it survives a
// switch of shot, line or tab in the same browser session. Equal to the original means no draft.
// forget() drops the stored draft after a send or save; the text on screen stays as it is.
import { useCallback, useState } from "react";

function read(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* storage off: keep it in memory only */ }
}

export function useDraft(key: string, original = ""): [string, (v: string) => void, () => void] {
  const [value, setValue] = useState(() => read(key) ?? original);
  const set = useCallback((v: string) => { setValue(v); write(key, v === original ? null : v); }, [key, original]);
  const forget = useCallback(() => write(key, null), [key]);
  return [value, set, forget];
}

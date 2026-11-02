// An in-page confirm, for questions window.confirm() would ask: some hosts (an embedded browser
// pane) never show the native dialog and answer "cancel" by themselves, so nothing would happen.
// makeConfirm() gives each caller its own question and host: ask(text, opts) resolves true on the
// confirm button, false on the cancel button or closing; askText(text, opts) is the same for
// window.prompt() (which such a host refuses outright): the typed text on confirm or Enter, null
// otherwise. opts names the buttons after what they do ({ ok: "Tạo clip (tốn 1 lượt)" }; default
// "Đồng ý" / "Huỷ"), and danger paints the confirm button red for what cannot be undone. Mount
// <ConfirmHost /> once where the caller renders.
import { useState } from "react";
import { create } from "zustand";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, Input } from "@/shell/controls.tsx";

export interface AskOptions { ok?: string; cancel?: string; danger?: boolean }
interface Ask { text: string | null; input: boolean; opts: AskOptions; resolve: ((v: string | null) => void) | null }

export function makeConfirm() {
  const useAsk = create<Ask>()(() => ({ text: null, input: false, opts: {}, resolve: null }));
  function open(text: string, input: boolean, opts: AskOptions): Promise<string | null> {
    useAsk.getState().resolve?.(null);
    return new Promise((resolve) => useAsk.setState({ text, input, opts, resolve }));
  }
  const ask = async (text: string, opts: AskOptions = {}): Promise<boolean> => (await open(text, false, opts)) !== null;
  const askText = (text: string, opts: AskOptions = {}): Promise<string | null> => open(text, true, opts);
  function answer(v: string | null): void {
    const { resolve } = useAsk.getState();
    useAsk.setState({ text: null, input: false, opts: {}, resolve: null });
    resolve?.(v);
  }
  function ConfirmHost() {
    const { text, input, opts } = useAsk();
    const [value, setValue] = useState("");
    const done = (ok: boolean) => { answer(ok ? (input ? value : "") : null); setValue(""); };
    return (
      <Dialog open={text !== null} onOpenChange={(o) => { if (!o) done(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{text}</DialogDescription>
          </DialogHeader>
          {input && (
            <form onSubmit={(e) => { e.preventDefault(); done(true); }}>
              <Input autoFocus aria-label={text ?? ""} value={value} onChange={(e) => setValue(e.target.value)} />
            </form>
          )}
          <DialogFooter>
            <Button data-confirm="cancel" onClick={() => done(false)}>{opts.cancel ?? "Huỷ"}</Button>
            <Button data-confirm="ok" variant={opts.danger ? "danger" : "primary"} onClick={() => done(true)}>{opts.ok ?? "Đồng ý"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return { ask, askText, ConfirmHost };
}

// An in-page confirm, for questions window.confirm() would ask: some hosts (an embedded browser
// pane) never show the native dialog and answer "cancel" by themselves, so nothing would happen.
// makeConfirm() gives each caller its own question and host: ask(text) resolves true on "Đồng ý",
// false on "Huỷ" or closing; askText(text) is the same for window.prompt() (which such a host
// refuses outright): the typed text on "Đồng ý" or Enter, null on "Huỷ" or closing. Mount
// <ConfirmHost /> once where the caller renders.
import { useState } from "react";
import { create } from "zustand";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, Input } from "@/shell/controls.tsx";

interface Ask { text: string | null; input: boolean; resolve: ((v: string | null) => void) | null }

export function makeConfirm() {
  const useAsk = create<Ask>()(() => ({ text: null, input: false, resolve: null }));
  function open(text: string, input: boolean): Promise<string | null> {
    useAsk.getState().resolve?.(null);
    return new Promise((resolve) => useAsk.setState({ text, input, resolve }));
  }
  const ask = async (text: string): Promise<boolean> => (await open(text, false)) !== null;
  const askText = (text: string): Promise<string | null> => open(text, true);
  function answer(v: string | null): void {
    const { resolve } = useAsk.getState();
    useAsk.setState({ text: null, input: false, resolve: null });
    resolve?.(v);
  }
  function ConfirmHost() {
    const { text, input } = useAsk();
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
            <Button onClick={() => done(false)}>Huỷ</Button>
            <Button variant="primary" onClick={() => done(true)}>Đồng ý</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return { ask, askText, ConfirmHost };
}

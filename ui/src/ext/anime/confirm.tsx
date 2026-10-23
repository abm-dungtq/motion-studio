// Port of public/ext-anime.js; behaviour unchanged.
// The confirm() prompts of the old Anime views (quota, removing a character or a stack, saving over
// a final video) as one Dialog: ask(text) resolves true on "Đồng ý", false on "Huỷ" or closing.
import { create } from "zustand";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/shell/controls.tsx";

interface Ask { text: string | null; resolve: ((ok: boolean) => void) | null }
const useAsk = create<Ask>()(() => ({ text: null, resolve: null }));

export function ask(text: string): Promise<boolean> {
  useAsk.getState().resolve?.(false);
  return new Promise((resolve) => useAsk.setState({ text, resolve }));
}

function answer(ok: boolean): void {
  const { resolve } = useAsk.getState();
  useAsk.setState({ text: null, resolve: null });
  resolve?.(ok);
}

export function ConfirmHost() {
  const text = useAsk((s) => s.text);
  return (
    <Dialog open={text !== null} onOpenChange={(open) => { if (!open) answer(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => answer(false)}>Huỷ</Button>
          <Button variant="primary" onClick={() => answer(true)}>Đồng ý</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

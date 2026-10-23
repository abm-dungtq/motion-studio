// The "Dự án mới" dialog, port of public/new-project.js: the fields of POST /api/projects/new with
// the server's limits (core/new-project.ts). An error stays in the dialog. On success the dialog
// closes and actions.projectCreated reloads the list, opens the project, toasts "Đã tạo dự án <tên>"
// and opens the media tab for "video-co-san". Escape and the outside click do nothing while busy.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actions } from "@/api/actions.ts";
import { projectsNew } from "@/api/queries.ts";
import { ASPECTS, DEFAULTS, LIMITS, MODES, NAME_PATTERN, bodyOf, failureText, hintOf, type NewProjectForm } from "@/core/new-project.ts";
import { useStudio } from "@/store/studio.ts";
import { Button, Input, Textarea } from "./controls.tsx";

const EMPTY: NewProjectForm = { name: "", mode: DEFAULTS.mode, aspect: DEFAULTS.aspect, topic: "", duration: DEFAULTS.duration, audience: "", first_request: "" };

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {note ? <small className="text-xs text-muted-foreground">{note}</small> : null}
    </label>
  );
}

function Choices({ legend, name, items, value, onChange }: { legend: string; name: string; items: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1 font-medium">{legend}</legend>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {items.map(([v, label]) => (
          <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1 has-[:checked]:border-primary">
            <input type="radio" name={name} value={v} checked={v === value} onChange={() => onChange(v)} className="accent-primary" />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function NewProjectDialog() {
  const open = useStudio((s) => s.dialog === "new-project");
  const [f, setF] = useState<NewProjectForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const errId = useId();

  // Every opening starts from the defaults (new-project.js resets the form on click).
  useEffect(() => { if (open) { setF(EMPTY); setError(null); } }, [open]);

  const set = <K extends keyof NewProjectForm>(k: K, v: NewProjectForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const close = () => { if (!busy) useStudio.getState().openDialog(null); };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!e.currentTarget.reportValidity()) return;
    const body = bodyOf(f);
    setBusy(true);
    try {
      const r = await projectsNew({ ...body });
      if (r.status !== 200) {
        // status 0 (no answer) carries send()'s own text, e.g. "không kết nối được Studio (…)".
        setError(failureText({ status: r.status, error: r.error, stderr: r.data?.stderr }));
        return;
      }
      const created = typeof r.data?.name === "string" ? r.data.name : body.name;
      useStudio.getState().openDialog(null);
      await actions.projectCreated(created, body.mode);
    } catch (x) {
      setError(`Không gửi được: ${x instanceof Error ? x.message : String(x)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent
        aria-label="Dự án mới"
        className="max-w-xl sm:max-w-xl"
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
        onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
        onOpenAutoFocus={(e) => { e.preventDefault(); nameRef.current?.focus(); }}
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Dự án mới</DialogTitle>
          <DialogDescription className="sr-only">Tạo thư mục dự án mới trong studio</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { void submit(e); }} className="flex flex-col gap-3" aria-describedby={error ? errId : undefined}>
          <Field label="Tên thư mục" note="chữ thường, số, gạch nối (2–49 ký tự)">
            <Input ref={nameRef} name="name" required pattern={NAME_PATTERN} autoComplete="off" spellCheck={false} placeholder="vi-du-video-moi" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Choices legend="Chế độ" name="mode" items={MODES.map((m) => [m.id, m.label] as const)} value={f.mode} onChange={(v) => set("mode", v)} />
          <Choices legend="Tỷ lệ" name="aspect" items={ASPECTS} value={f.aspect} onChange={(v) => set("aspect", v)} />
          <Field label="Chủ đề">
            <Textarea name="topic" required maxLength={LIMITS.topic} rows={2} placeholder="Video nói về điều gì?" value={f.topic} onChange={(e) => set("topic", e.target.value)} />
          </Field>
          <div className="flex gap-3">
            <Field label="Thời lượng (giây)">
              <Input type="number" name="duration" required min={LIMITS.durationMin} max={LIMITS.durationMax} step={1} value={f.duration} onChange={(e) => set("duration", e.target.value)} />
            </Field>
            <Field label="Khán giả (tuỳ chọn)">
              <Input name="audience" maxLength={LIMITS.audience} placeholder="Ví dụ: chủ shop online mới bắt đầu" value={f.audience} onChange={(e) => set("audience", e.target.value)} />
            </Field>
          </div>
          <Field label="Việc đầu tiên giao cho AI (tuỳ chọn)">
            <Textarea name="first_request" maxLength={LIMITS.first_request} rows={3} placeholder={hintOf(f.mode)} value={f.first_request} onChange={(e) => set("first_request", e.target.value)} />
          </Field>
          {error ? <p id={errId} role="alert" className="m-0 text-sm whitespace-pre-line text-danger">{error}</p> : null}
          <DialogFooter>
            <Button disabled={busy} onClick={close}>Huỷ</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "Đang tạo…" : "Tạo dự án"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

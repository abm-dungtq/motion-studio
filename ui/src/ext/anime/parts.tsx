// Port of public/ext-anime.css; behaviour unchanged.
// Small pieces the three Anime views share: a labelled field, a tag, a log box, a native select and
// an input that commits on change (blur or Enter) like the old `onchange` inputs.
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const muted = "m-0 text-xs text-muted-foreground";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Tag({ warn, children }: { warn?: boolean; children: ReactNode }) {
  return warn
    ? <p data-tag="warn" className="m-0 rounded-md border border-warn/60 bg-warn/10 px-2 py-1 text-xs text-warn">{children}</p>
    : <span data-tag="" className="inline-block rounded-full border border-border bg-panel-2 px-2 py-0.5 text-xs text-muted-foreground">{children}</span>;
}

export function Log({ lines, fallback }: { lines: string[]; fallback?: string }) {
  const text = lines.join("\n") || fallback || "";
  if (!text) return null;
  return <pre className="m-0 max-h-44 overflow-auto rounded-md bg-panel-2 p-2 text-[11px] break-words whitespace-pre-wrap">{text}</pre>;
}

const FIELD = "rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, "h-8 min-w-0", className)} {...props} />;
}

type LazyProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & { value: string; onCommit: (v: string) => void };

// The native "change" event: the text differs from what it was when the field took focus (or last
// changed). Shows `value`, keeps what is typed locally, hands it on at blur or Enter.
function useChange(value: string, onCommit: (v: string) => void) {
  const [v, setV] = useState(value);
  const base = useRef(value);
  useEffect(() => { setV(value); base.current = value; }, [value]);
  return {
    value: v,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onFocus: () => { base.current = v; },
    commit: () => { if (v !== base.current) { base.current = v; onCommit(v); } },
  };
}

export function LazyInput({ value, onCommit, className, onKeyDown, ...props }: LazyProps) {
  const { commit, ...f } = useChange(value, onCommit);
  return (
    <input
      type="text"
      className={cn(FIELD, "h-8 w-full", className)}
      {...f}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); onKeyDown?.(e); }}
      {...props}
    />
  );
}

type LazyAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "defaultValue"> & { value: string; onCommit: (v: string) => void };

export function LazyTextarea({ value, onCommit, className, ...props }: LazyAreaProps) {
  const { commit, ...f } = useChange(value, onCommit);
  return <textarea className={cn(FIELD, "w-full py-1.5", className)} {...f} onBlur={commit} {...props} />;
}

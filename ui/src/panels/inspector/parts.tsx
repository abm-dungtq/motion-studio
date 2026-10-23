// Port of the shared pieces of public/inspector.js (headings, labels, number fields, key/value
// rows, t3); behaviour unchanged.
import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "@/shell/controls.tsx";

export const Title = ({ children }: { children: ReactNode }) => <h3 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground">{children}</h3>;
export const Muted = ({ children }: { children: ReactNode }) => <div className="text-sm text-muted-foreground">{children}</div>;
export const Note = ({ children, role }: { children: ReactNode; role?: string }) => <div data-role={role} className="rounded-sm border border-warn/50 bg-warn/10 px-2.5 py-2 text-sm">{children}</div>;

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm">{label}{children}</label>;
}

export function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 text-sm"><span>{k}</span><strong className="text-right">{v}</strong></div>;
}

// A number field kept as text, so a blank stays blank (music end: blank = to the end).
export function NumberField({ value, onValue, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & { value: string; onValue: (v: string) => void }) {
  return <Input type="number" value={value} onChange={(e) => onValue(e.target.value)} {...rest} />;
}

export const t3 = (x: unknown): string => (typeof x === "number" && Number.isFinite(x) ? `${x.toFixed(3)}s` : "—");

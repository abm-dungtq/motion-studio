// Port of public/lemo-gallery.js; behaviour unchanged.
// The shot inspector's "Phong cách code" (shotSection, lemo-gallery.js:163-192): the project's
// style, this shot's, and a compact picker to apply one to the shot.
import { useRef } from "react";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { SELECT } from "./Gallery.tsx";
import { applyStyle, modeText, useAllStyles, useLemo } from "./store.ts";
import { shotConfirm } from "./confirm.tsx";

export function ShotStyle({ pick, m }: InspectorSectionProps) {
  const name = useStudio((s) => s.name);
  const busy = useLemo((s) => s.busy);
  const { data: d } = useAllStyles(name);
  const sel = useRef<HTMLSelectElement>(null);
  const shot = pick.id;
  if (!shot) return null;

  const head = <h3 className="m-0 text-sm font-semibold">Phong cách code</h3>;
  if (!d) return <div className="flex flex-col gap-1.5" data-testid="lemo-shot">{head}<p className="m-0 text-sm text-muted-foreground">Đang tải…</p></div>;

  const p = d.project ?? {};
  const rows = d.rows;
  const styleName = (slug: string) => rows.find((r) => r.slug === slug)?.ten ?? slug;
  const lines = [
    p.project ? `Dự án: ${styleName(p.project.slug)} (${modeText(p.project.mode)})` : "Dự án chưa áp phong cách code nào.",
    p.shots?.[shot] ? `Shot ${shot}: ${styleName(p.shots[shot].slug)} (${modeText(p.shots[shot].mode)})` : null,
  ].filter((t): t is string => Boolean(t));
  const apply = () => {
    const [source, slug] = (sel.current?.value ?? "").split(":");
    const style = rows.find((r) => r.slug === slug && r.source === source);
    if (style) void applyStyle({ name, hasManifest: Boolean(m), style, mode: style.layer ? "layer" : "grammar", shot, ask: shotConfirm.ask });
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid="lemo-shot">
      {head}
      {lines.map((t) => <p key={t} className="m-0 text-sm text-muted-foreground">{t}</p>)}
      <details>
        <summary className="cursor-pointer text-sm">Áp phong cách cho shot này</summary>
        {rows.length ? (
          <div className="mt-2 flex flex-col gap-2">
            <select ref={sel} className={`${SELECT} w-full`} aria-label="Phong cách cho shot này">
              {rows.map((r) => <option key={`${r.source}:${r.slug}`} value={`${r.source}:${r.slug}`}>{`${r.source === "mine" ? "★ " : ""}${r.ten}${r.layer ? " · lớp canvas" : ""}`}</option>)}
            </select>
            <div><Button variant="primary" disabled={!m || busy} onClick={apply}>Áp</Button></div>
          </div>
        ) : <p className="m-0 mt-2 text-sm text-muted-foreground">Chưa có phong cách nào: mở tab Phong cách và tải thư viện.</p>}
      </details>
      <shotConfirm.ConfirmHost />
    </div>
  );
}

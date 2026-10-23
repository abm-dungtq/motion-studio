// Port of decorations of public/timeline.js (:369-382); behaviour unchanged.
// View-only marks of the extensions' timeline decorators (ext/registry.ts registerTimelineDecorator)
// on the shot, voice, music and SFX lanes: a band from t to until in the colour of its kind
// (--ms-deco-*; an unknown kind uses info), or a thin mark at t. A decorator that throws is skipped
// and logged. They never take a pointer.
import { memo } from "react";
import type { Manifest } from "@/api/types.ts";
import { decorationItems, type DecoItem, type DecoLane, type Decorator } from "@/core/timeline-edit.ts";
import type { TimelineDecorator } from "@/ext/registry.ts";
import type { Pick } from "@/store/studio.ts";

const KINDS = new Set(["info", "warn", "bad", "ok"]);

export function decoByLane(decorators: readonly TimelineDecorator[], m: Manifest, state: { name: string | null; sel: string | null; pick: Pick }): Record<DecoLane, DecoItem[]> {
  // decorationItems takes any (m, state) function; the registry's are typed narrower.
  return decorationItems(decorators as unknown as readonly Decorator[], m, state, (e) => console.error("timeline decorator", e));
}

export const Decorations = memo(function Decorations({ items, pps }: { items: DecoItem[]; pps: number }) {
  return (
    <>
      {items.map((d, i) => {
        const band = d.until !== null;
        const w = band ? (d.until! - d.t) * pps : 2;
        return (
          <div
            key={i}
            className={band ? "tl-deco band" : "tl-deco"}
            data-kind={d.kind}
            title={d.label}
            aria-hidden="true"
            style={{
              position: "absolute", top: 0, bottom: 0, left: d.t * pps, width: w, zIndex: 0, overflow: "hidden", whiteSpace: "nowrap", fontSize: 10,
              padding: band ? "0 3px" : 0, pointerEvents: "none", color: "var(--ms-muted)",
              background: band ? `var(--ms-deco-${KINDS.has(d.kind) ? d.kind : "info"})` : "currentColor",
            }}
          >
            {band && w > 24 ? d.label : null}
          </div>
        );
      })}
    </>
  );
});

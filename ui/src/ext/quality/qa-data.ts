// The project's QA, read from QA.md (core/qa-parse.ts), for the timeline bands and the top bar chip.
// The bands come from the query cache, so a decorator (a plain function) sees what the chip sees.
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import type { Manifest } from "@/api/types.ts";
import { currentQa, type QaSection } from "@/core/qa-parse.ts";
import type { DecoBand } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";

export const QA_FILE = "QA.md";

let last: { text: string | null | undefined; sections: QaSection[] } = { text: undefined, sections: [] };
export function qaSections(text: string | null | undefined): QaSection[] {
  if (text !== last.text) last = { text, sections: currentQa(text) };
  return last.sections;
}

// Every WARN and FAIL with a time, on the shot lane: a band over a span, a thin mark at a time.
export function qaBands(_m: Manifest, state: { name: string | null }): DecoBand[] {
  if (!useStudio.getState().qaLayer || !state.name) return [];
  const text = queryClient.getQueryData<string | null>(keys.projectText(state.name, QA_FILE));
  return qaSections(text).flatMap((s) => s.items)
    .filter((x) => x.level !== "PASS" && x.t !== undefined)
    .map((x) => ({ t: x.t!, until: x.until ?? null, lane: "shot" as const, label: x.code, title: `${x.level} ${x.code} ${x.text}`, kind: x.level === "FAIL" ? "bad" : "warn" }));
}

export function qaCounts(sections: readonly QaSection[]): { fail: number; warn: number } {
  const items = sections.flatMap((s) => s.items);
  return { fail: items.filter((x) => x.level === "FAIL").length, warn: items.filter((x) => x.level === "WARN").length };
}

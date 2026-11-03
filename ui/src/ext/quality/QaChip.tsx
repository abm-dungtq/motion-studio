// The QA chip of the top bar, next to the export gate chip: "QA: 2 lỗi, 31 cảnh báo" or "QA đạt",
// hidden while the project has no QA.md (or nothing in it the parser knows). A click opens what
// each check said last; a check with a time has "Tới", which moves the playhead there.
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { actions } from "@/api/actions.ts";
import { useProjectText } from "@/api/queries.ts";
import type { QaItem, QaSection } from "@/core/qa-parse.ts";
import { useStudio } from "@/store/studio.ts";
import { QA_FILE, qaCounts, qaSections } from "./qa-data.ts";

const LEVEL: Record<QaItem["level"], string> = { PASS: "text-ok", WARN: "text-warn", FAIL: "text-destructive" };
const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function chipText({ fail, warn }: { fail: number; warn: number }): string {
  if (!fail && !warn) return "QA đạt";
  return `QA: ${[fail ? `${fail} lỗi` : "", warn ? `${warn} cảnh báo` : ""].filter(Boolean).join(", ")}`;
}

function Section({ s }: { s: QaSection }) {
  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="m-0 text-xs font-semibold">{s.gate}{s.file ? ` · ${s.file}` : ""} <span className="font-normal text-muted-foreground">{s.at}</span></h3>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {s.items.map((x, k) => (
          <li key={k} className="flex items-start gap-2 text-xs">
            <span className={`w-10 flex-none font-medium ${LEVEL[x.level]}`}>{x.level}</span>
            <span className="min-w-0 flex-1">{x.code} {x.text}</span>
            {x.t !== undefined && (
              <button
                type="button"
                aria-label={`Tới ${clock(x.t)} (${x.code})`}
                className="flex-none rounded-sm border border-border px-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => actions.seek(x.t!)}
              >
                Tới
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QaChip() {
  const name = useStudio((s) => s.name);
  const { data: text } = useProjectText(name, QA_FILE);
  const sections = qaSections(text);
  if (!text || !sections.length) return null;
  const counts = qaCounts(sections);
  const tone = counts.fail ? "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25"
    : counts.warn ? "border-warn/60 bg-warn/15 text-warn hover:bg-warn/25"
    : "border-ok/60 bg-ok/15 text-ok hover:bg-ok/25";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="qa-chip"
          className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${tone}`}
        >
          {chipText(counts)}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label="Kết quả QA" align="end" collisionPadding={8} className="flex max-h-[70vh] w-[min(520px,92vw)] flex-col gap-2 overflow-y-auto p-3">
        {sections.map((s, k) => <Section key={k} s={s} />)}
      </PopoverContent>
    </Popover>
  );
}

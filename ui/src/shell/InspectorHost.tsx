// The Shot tab: the inspector sections registered for the picked block's kind, by order, each in
// its own ErrorBoundary; a section that throws shows "Mục mở rộng lỗi: …" (inspector.js:35).
// Without a pick it lists the shots, each a button that picks it as a click on the timeline does.
import { actions } from "@/api/actions.ts";
import { useProject } from "@/api/queries.ts";
import { useInspectorSections } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { Button } from "./controls.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Empty } from "./states.tsx";

export function InspectorHost() {
  const pick = useStudio((s) => s.pick);
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const sections = useInspectorSections(pick?.kind);
  if (!pick && m?.shots?.length) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <p className="m-0 text-sm text-muted-foreground">Chọn một shot, hoặc một khối trên timeline</p>
        <ul aria-label="Các shot" className="m-0 flex list-none flex-col gap-1 p-0">
          {m.shots.map((s, i) => (
            <li key={s.id}>
              <Button className="w-full justify-start" onClick={() => actions.select(s.id)}>
                <span className="truncate">{`Shot ${i + 1} · ${s.name || s.id}`}</span>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (!pick) return <Empty text="Chọn một khối trên timeline" />;
  return (
    <div className="flex flex-col gap-3 p-3">
      {sections.map((s) => (
        <section key={s.seq} data-section={`inspector/${s.id}`}>
          <ErrorBoundary
            what={`inspector ${s.id}`}
            resetKey={`${name}\n${pick.kind}\n${pick.id}`}
            fallback={(e) => <p className="text-sm text-danger">{`Mục mở rộng lỗi: ${e.message}`}</p>}
          >
            <s.component pick={pick} m={m ?? null} />
          </ErrorBoundary>
        </section>
      ))}
    </div>
  );
}

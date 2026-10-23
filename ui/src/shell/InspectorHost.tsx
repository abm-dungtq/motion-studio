// The Shot tab: the inspector sections registered for the picked block's kind, by order, each in
// its own ErrorBoundary; a section that throws shows "Mục mở rộng lỗi: …" (inspector.js:35).
// Without a pick it says what to do.
import { useProject } from "@/api/queries.ts";
import { useInspectorSections } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Empty } from "./states.tsx";

export function InspectorHost() {
  const pick = useStudio((s) => s.pick);
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const sections = useInspectorSections(pick?.kind);
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

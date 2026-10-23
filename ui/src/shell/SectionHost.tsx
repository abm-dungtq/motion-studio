// The sections registered for one host (a tab id, "director" or "export"), by order, each in its
// own ErrorBoundary so one failing section leaves the others running.
import { useSections } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

export function SectionHost({ hostId }: { hostId: string }) {
  const sections = useSections(hostId);
  const name = useStudio((s) => s.name);
  if (!sections.length) return null;
  return (
    <>
      {sections.map((s) => (
        <section key={s.seq} data-section={`${hostId}/${s.id}`}>
          <ErrorBoundary what={`section ${hostId}/${s.id}`} resetKey={name}>
            <s.component />
          </ErrorBoundary>
        </section>
      ))}
    </>
  );
}

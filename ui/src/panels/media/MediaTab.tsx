// Port of public/panels.js; behaviour unchanged.
// The media() view (panels.js:131-192): three sections in the old order and with the old titles
// (:188-190). Without a manifest it says what to do first (:133).
import type { ReactNode } from "react";
import { useProject } from "@/api/queries.ts";
import { NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { Assets } from "./Assets.tsx";
import { Browser } from "./Browser.tsx";
import { Registered } from "./Registered.tsx";

// inline-size containment: the left panel's scroll area sizes its content like a table, so a long
// file name would otherwise widen the whole panel past its edge.
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 [contain:inline-size]">
      <h3 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function MediaTab() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  if (!name || !m) return <NeedManifest />;
  return (
    <>
      <Group title="Footage đã thêm"><Registered name={name} /></Group>
      <Group title="Chọn file trên máy"><Browser name={name} editable={Boolean(m.capabilities?.editable)} /></Group>
      <Group title="File trong assets/"><Assets name={name} /></Group>
    </>
  );
}

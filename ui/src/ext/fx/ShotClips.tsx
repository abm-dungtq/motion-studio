// Port of public/fx-footage.js; behaviour unchanged.
// The shot inspector's fx section: "Sửa clip của shot" for the shot's own videos (the clip editor
// with "Dùng trong shot" preset to replace that asset), and a button that opens the fx tab, where
// the transition library of the shot now lives.
import { ArrowLeftRight } from "lucide-react";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { ClipEditor } from "./ClipEditor.tsx";
import { isVideo } from "./clip-params.ts";

export function openFxTab(): void {
  const s = useStudio.getState();
  s.setLeftTab("fx");
  s.toggleLeft(true);
}

export function ShotClips({ pick, m }: InspectorSectionProps) {
  const name = useStudio((s) => s.name);
  const shot = m?.shots?.find((s) => s.id === pick.id);
  if (!shot) return null;
  const vids = (shot.assets ?? []).filter(isVideo);
  return (
    <div className="flex flex-col gap-3">
      <Button className="self-start" onClick={openFxTab}><ArrowLeftRight aria-hidden />Mở thư viện chuyển cảnh</Button>
      {vids.length ? (
        <section className="flex flex-col gap-2" aria-label="Sửa clip của shot">
          <h3 className="m-0 text-sm font-semibold">Sửa clip của shot</h3>
          <ClipEditor key={shot.id} editorKey={`shot:${name}:${shot.id}`} sources={vids.map((a) => ({ value: a, label: a.split("/").pop() ?? a }))} shot={shot} />
        </section>
      ) : null}
    </div>
  );
}

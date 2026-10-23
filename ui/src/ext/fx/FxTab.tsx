// Port of public/ext-fx.js; behaviour unchanged.
// The fx tab: the transition library for the selected shot (it sat in the shot inspector before),
// then "Sửa clip" for every registered video (it sat in the media tab before).
import { useProject } from "@/api/queries.ts";
import { Empty, NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { Footage } from "./Footage.tsx";
import { Gallery } from "./Gallery.tsx";

export function FxTab() {
  const name = useStudio((s) => s.name);
  const sel = useStudio((s) => s.sel);
  const { data: m } = useProject(name);
  if (!m) return <NeedManifest />;
  const shot = m.shots.find((s) => s.id === sel);
  return (
    <div className="flex flex-col gap-5">
      {shot ? <Gallery key={shot.id} shot={shot} m={m} /> : <Empty text="Chọn một shot trên timeline để áp chuyển cảnh" />}
      <Footage />
    </div>
  );
}

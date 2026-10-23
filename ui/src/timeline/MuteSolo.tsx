// Port of muteButtons of public/timeline.js (:34, :356-367); behaviour unchanged.
// M and S of an audio track: mute it, or hear only the soloed tracks, in the player only
// (store.audio, which the stage hands to the player). project.json never changes.
import { memo, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { useStudio, type AudioGroup } from "@/store/studio.ts";

// Track label → audio group of the player (the old "voiceover" is "voice" in the store).
export const GROUPS: Record<string, AudioGroup> = { "Lồng tiếng": "voice", "Nhạc": "music", "SFX": "sfx" };

const BTN = "ms-btn h-[18px] w-[22px] cursor-pointer rounded-sm border border-border bg-panel p-0 text-[11px] leading-none font-bold text-muted-foreground hover:border-primary hover:text-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";

export const MuteSolo = memo(function MuteSolo({ group, name }: { group: AudioGroup; name: string }) {
  const muted = useStudio((s) => s.audio.mute.includes(group));
  const solo = useStudio((s) => s.audio.solo.includes(group));
  const btn = (kind: "mute" | "solo", on: boolean, text: string, title: string) => (
    <button
      type="button"
      className={cn(BTN)}
      title={`${title} ${name} khi xem thử`}
      aria-label={`${title} ${name}`}
      aria-pressed={on}
      onClick={(e: MouseEvent) => { e.stopPropagation(); useStudio.getState().toggleAudio(kind, group); }}
    >
      {text}
    </button>
  );
  return <div className="ms flex gap-1">{btn("mute", muted, "M", "Tắt tiếng")}{btn("solo", solo, "S", "Chỉ nghe")}</div>;
});

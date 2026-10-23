// lib/nle/otio.mjs — OpenTimelineIO JSON of the NLE model (lib/nle/index.mjs timeline()).
// Schemas as OpenTimelineIO serializes them (https://github.com/AcademySoftwareFoundation/OpenTimelineIO,
// commit eee67fd, Apache-2.0): Timeline.1 > Stack.1 > Track.1 > Clip.2 with an ExternalReference.1
// under media_references.DEFAULT_MEDIA, RationalTime.1 / TimeRange.1 in frames at the timeline
// rate, Marker.2 (its color a name such as "GREEN"); field layout after ChatOctopus/timeline
// src/otio/writer.ts (https://github.com/ChatOctopus/timeline, commit 352d8f8, MIT).
// target_url is relative to the bundle folder, so the .otio keeps working when the folder moves.
// The markers sit on the Stack (the whole timeline); voice lines are GREEN, SFX RED.

const COLOR = { line: "GREEN", sfx: "RED" };

export function otio(t) {
  const rate = t.rate.num / t.rate.den;
  const rt = (value) => ({ OTIO_SCHEMA: "RationalTime.1", rate, value });
  const range = (start, duration) => ({ OTIO_SCHEMA: "TimeRange.1", duration: rt(duration), start_time: rt(start) });
  const clip = (x, start, duration, length) => ({
    OTIO_SCHEMA: "Clip.2", metadata: {}, name: x.name, source_range: range(start, duration), effects: [], markers: [], enabled: true, color: null,
    media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: "ExternalReference.1", metadata: {}, name: x.asset, available_range: range(0, length), available_image_bounds: null, target_url: x.file } },
    active_media_reference_key: "DEFAULT_MEDIA",
  });
  const track = (name, kind, children) => ({ OTIO_SCHEMA: "Track.1", metadata: {}, name, source_range: null, effects: [], markers: [], enabled: true, color: null, children, kind });
  const doc = {
    OTIO_SCHEMA: "Timeline.1",
    metadata: { "motion-studio": { width: t.width, height: t.height, fps: `${t.rate.num}/${t.rate.den}` } },
    name: t.name,
    global_start_time: rt(0),
    tracks: {
      OTIO_SCHEMA: "Stack.1", metadata: {}, name: "tracks", source_range: null, effects: [],
      markers: t.markers.map((m) => ({ OTIO_SCHEMA: "Marker.2", metadata: {}, name: m.name, color: COLOR[m.kind], marked_range: range(m.frame, 1), comment: m.note })),
      enabled: true, color: null,
      children: [
        track("V1", "Video", t.video.map((v) => clip(v, 0, v.duration, v.duration))),
        ...t.audio.map((a, i) => track(`A${i + 1} ${a.name}`, "Audio", [clip(a, a.start, a.duration, a.length)])),
      ],
    },
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

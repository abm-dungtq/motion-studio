import { test } from "node:test";
import assert from "node:assert/strict";
import { draftStyle, grammarProject, grammarShot, insertMarkers, layerScene, RULES } from "../lib/lemo/requests.mjs";
import { adapterFor } from "../lib/provider.mjs";

const A = await adapterFor({});
const GUIDE = "/cache/lemo/3961ddb/styles/ukiyoe/STYLE.md";
const NO_STORY = /không chép câu chuyện/;
const DOM = /chữ tiếng Việt nằm ở lớp DOM/;

const all = () => ({
  layerProject: layerScene({ slug: "watercolor", ten: "Thuỷ màu tự vẽ", next: "next: read styles/watercolor/STYLE.md (in /c), write assets/lemo/scene.js" }),
  layerShot: layerScene({ slug: "watercolor", ten: "Thuỷ màu tự vẽ", next: "next: x", shot: "s2" }),
  project: grammarProject({ slug: "ukiyoe", ten: "Tranh khắc Ukiyo-e", guide: GUIDE }),
  shot: grammarShot({ slug: "ukiyoe", ten: "Tranh khắc Ukiyo-e", guide: GUIDE, shot: "s2" }),
  draft: draftStyle({ base: { slug: "ukiyoe", ten: "Tranh khắc Ukiyo-e", guide: GUIDE }, myGuide: "/cache/lemo/MY-STYLES.md", title: "Mưa", description: "Ukiyo-e mà màu ấm hơn" }),
  blank: draftStyle({ base: null, myGuide: "/cache/lemo/MY-STYLES.md" }),
  markers: insertMarkers({ slug: "watercolor" }),
});

test("every grammar and draft request points at STYLE.md and keeps the shared rules", () => {
  const t = all();
  for (const k of ["project", "shot", "draft"]) assert.ok(t[k].includes(GUIDE), k);
  for (const k of ["layerProject", "layerShot", "project", "shot", "draft", "blank"]) {
    assert.match(t[k], NO_STORY, k);
    assert.match(t[k], DOM, k);
    for (const r of RULES) assert.ok(t[k].includes(r), `${k}: ${r}`);
  }
});

test("shot requests name the shot; a layer for one shot draws only in its window", () => {
  const t = all();
  assert.match(t.shot, /shot s2/);
  assert.match(t.layerShot, /win\["s2"\]/);
  assert.doesNotMatch(t.layerProject, /win\["/);
  assert.match(t.layerProject, /next: read styles\/watercolor\/STYLE\.md/);
});

test("draft works inside lemo-style/ and leaves keeping to the user", () => {
  const t = all();
  assert.match(t.draft, /lemo-style\//);
  assert.match(t.draft, /Giữ phong cách/);
  assert.match(t.draft, /MY-STYLES\.md/);
  assert.match(t.blank, /trang trắng/);
});

test("markers request names the four markers", () => {
  const t = all().markers;
  for (const m of ["<!-- LEMO-LAYER:BEGIN -->", "<!-- LEMO-LAYER:END -->", "/* LEMO:BEGIN */", "/* LEMO:END */"]) assert.ok(t.includes(m), m);
});

test("no request names the provider", () => {
  for (const [k, v] of Object.entries(all())) assert.ok(!v.toLowerCase().includes(A.ID), k);
});

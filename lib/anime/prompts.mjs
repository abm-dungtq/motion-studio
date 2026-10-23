// lib/anime/prompts.mjs — prompt templates for the anime motion-comic pipeline.
//
// sheet() adapts the four-view character reference sheet of AIComicBuilder
// (https://github.com/LingyiChen-AI/AIComicBuilder, commit e01e7dd501131922fb5051ec36926271d394b4d3,
// src/lib/ai/prompts/character-image.ts, Apache-2.0): front, three-quarter, side and back views
// with identical identity, outfit and alignment. Changed for this pipeline: a flat key-colour
// background instead of white (the sheet is cut out later), no name label (text on the sheet
// leaks into every pose), and the description is the only style authority.
// edit() and pose() are the edit-mode prompts that kept framing in the zoro-vs-mihawk project
// (its plans/handoffs/anime-motion-comic-*.md, "Lệnh mẫu đã dùng"). The agent adapter adds the
// "use your image tool in EDIT mode" lead and the save instruction (lib/agents/cli/codex.mjs).
import { parseColor, spillOf, toHex } from "./keying.mjs";

const clean = (s, max, what) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) throw Object.assign(new Error(`cần ${what}`), { status: 400 });
  if (t.length > max) throw Object.assign(new Error(`${what} dài quá ${max} ký tự`), { status: 400 });
  return t;
};
const colorName = (c) => {
  const rgb = parseColor(c);
  return `perfectly flat solid pure ${spillOf(rgb) ?? "key colour"} (${toHex(rgb).replace(/^0x/, "#")})`;
};

export function sheet({ name = "", description, keyColor = "#0047FF", palette = [] }) {
  const desc = clean(description, 2000, "mô tả nhân vật");
  const pal = Array.isArray(palette) && palette.length ? ` Palette: ${palette.join(", ")}.` : "";
  return [
    "Character four-view reference sheet, professional character design document.",
    `CHARACTER (authoritative, including its art style): ${name ? `${clean(name, 80, "tên")}. ` : ""}${desc}${pal}`,
    "LAYOUT: four views left to right, same scale, heads aligned at the same top edge, full figure: 1 FRONT facing the viewer, 2 THREE-QUARTER turned about 45 degrees right, 3 SIDE PROFILE at 90 degrees facing right, 4 BACK fully facing away.",
    "CONSISTENCY: identical face, hair, proportions, colours, outfit, accessories and weapons in every view; same expression; same lighting direction.",
    `BACKGROUND: ${colorName(keyColor)} behind every view, no gradient, no floor, no shadows on the background, no scenery.`,
    "No text, no name label, no frame, no watermark. Japanese anime style, cel shading, sharp clean line art, unless the description names another style.",
  ].join("\n");
}

export function edit(change, { keyColor = "#0047FF" } = {}) {
  return `Keep EXACTLY the same character, pose, framing, camera, line art, colors and background (${colorName(keyColor)}). Change ONLY: ${clean(change, 1500, "thay đổi")}. Output the same size.`;
}

export function pose(change, { keyColor = "#0047FF" } = {}) {
  return `Same character, same outfit, same art style, same camera angle and framing, same ${colorName(keyColor)} background. The other attached images are the character's reference sheet: match it exactly. Redraw the character in this new pose: ${clean(change, 1500, "tư thế")}. Output the same size.`;
}

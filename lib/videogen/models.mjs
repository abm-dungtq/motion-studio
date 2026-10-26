// lib/videogen/models.mjs — the gflow models and frames Studio offers (spec.mjs, config.mjs).
// No imports: config.mjs reads it, and spec.mjs's imports lead back to config.mjs.
export const VIDEO_MODELS = ["omni-flash", "veo-lite", "veo-fast", "veo-quality"];
// imagen4 is not offered on the migrated Flow host (gflow exits 36).
export const IMAGE_MODELS = ["nano2", "nano2.1", "nano-pro", "nano2-lite"];
export const VIDEO_ASPECTS = ["16:9", "9:16"];
export const IMAGE_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
export const RESOLUTIONS = ["720p", "360p"];
// The cheapest video model known (10 credits); omni-flash's price is not measured yet.
export const DEFAULT_VIDEO_MODEL = "veo-lite";
export const DEFAULT_IMAGE_MODEL = "nano2";

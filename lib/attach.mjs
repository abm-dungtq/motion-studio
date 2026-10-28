// lib/attach.mjs — puts a project file into a shot's assets through the provider's gateway
// (set_shot assets): a new version that Undo takes back. Studio never edits the HTML.
const bad = (status, msg) => Object.assign(new Error(msg), { status });

export function attachAsset(dir, gateway, { shot, base, rel, manifest, actor = "human", lockWaitMs = 300 }) {
  const s = (manifest?.shots ?? []).find((x) => x.id === shot);
  if (!s) throw bad(404, `không có shot ${shot}`);
  const assets = Array.isArray(s.assets) ? s.assets : [];
  if (assets.includes(rel)) return { rel, version: manifest.version, unchanged: true };
  const r = gateway.patch(dir, { actor, base, ops: [{ op: "set_shot", id: shot, field: "assets", value: [...assets, rel] }], lockWaitMs });
  return { rel, gateway: r };
}

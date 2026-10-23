// ui/scripts/smoke-server.mjs <checkout> <port> <root> [--no-provider]
// A test Studio on its own port. Never 4317: that is the user's running Studio.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [checkout, port, root] = process.argv.slice(2);
if (!checkout || !port || !root) { console.error("usage: smoke-server.mjs <checkout> <port> <root> [--no-provider]"); process.exit(2); }
if (Number(port) === 4317) { console.error("cổng 4317 là Studio thật, không dùng"); process.exit(2); }
process.env.MOTION_STUDIO_STATE = join(root, "studio.json");
if (process.argv.includes("--no-provider")) process.env.OPUS_VIDEO_HOME = "/nonexistent";
const { createServer } = await import(pathToFileURL(join(checkout, "server.mjs")).href);
const s = createServer({ root, token: `smoke-${port}` });
s.listen(Number(port), "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/ (checkout ${checkout}, root ${root})`));

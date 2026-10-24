// Creates <root>/<name> with a BRIEF.md and an index.html, like a series episode template.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const v = Object.fromEntries(process.argv.slice(2).map((a) => a.match(/^--([a-z]+)=(.*)$/s)?.slice(1)).filter(Boolean));
const name = v.name ?? `ep-${String(v.episode).padStart(2, "0")}`;
const dir = join(v.root, name);
if (existsSync(dir)) { console.error(`${dir} đã có`); process.exit(3); }
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "BRIEF.md"), `---\ntitle: ${v.title}\nseries: ${process.cwd()}\n---\n`);
writeFileSync(join(dir, "index.html"), "<html></html>\n");
console.log(`EPISODE ${dir}`);

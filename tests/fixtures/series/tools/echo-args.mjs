// Prints its arguments as JSON and writes "ok" to the --out file when one is given.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const args = process.argv.slice(2);
console.log(JSON.stringify({ args, cwd: process.cwd() }));
const out = args.find((a) => a.startsWith("--out="))?.slice(6);
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, "ok\n"); }

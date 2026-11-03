// Spawns a grandchild that never exits, prints its pid, then hangs: what a provider check that
// runs ffmpeg looks like to the server.
import { spawn } from "node:child_process";
const g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
console.log(String(g.pid));
setInterval(() => {}, 1000);

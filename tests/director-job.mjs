// A director job Studio holds for a request, as lib/scope.mjs looks it up: tools called with actor
// director:<request> may change only that job's project. stop() ends it.
import { tmpdir } from "node:os";
import { cancel, startJob } from "../jobs.mjs";

export function holdDirector(name, request) {
  const j = startJob({ name, kind: "director", cmd: "/bin/sleep", args: ["600"], cwd: tmpdir(), meta: { request } });
  return { job: j, stop: () => cancel(j.id) };
}

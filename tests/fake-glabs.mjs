// tests/fake-glabs.mjs — a G-Labs Studio webhook stand-in on 127.0.0.1:<random> for the videogen
// tests. set() merges behaviour: submit ("accept" | "reject:<code>" | "hang" | "hang-after-create"
// | "500"), statuses (steps of GET status, the last one repeats; "gone" answers 404) and file (an
// mp4 served at /api/files/clip-<id>.mp4), tasks ("hang" never answers GET /api/tasks; tasksCalls counts them).
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { randomBytes } from "node:crypto";

export async function fakeGlabs({ key = "k".repeat(43) } = {}) {
  const cfg = { submit: "accept", statuses: ["completed"], file: null };
  const fake = { url: null, key, posts: [], stops: [], tasks: new Map(), statusCalls: 0, tasksCalls: 0, set: (o) => Object.assign(cfg, o), close: null };
  const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const create = (body) => {
    const id = randomBytes(4).toString("hex");
    fake.tasks.set(id, { prompt: String(body.prompt ?? ""), created_at: Date.now() / 1000, step: 0, res: Array.isArray(body.resolution) ? body.resolution.length : 1 });
    return id;
  };
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, fake.url);
    const p = u.pathname;
    if (p === "/api/health") return send(res, 200, { status: "ok", server: "G-Labs Webhook", uptime: 1, tasks_pending: 0, tasks_running: 0 });
    if (p.startsWith("/api/files/")) {
      if (!cfg.file) return send(res, 404, { error: "no file" });
      res.writeHead(200, { "content-type": "video/mp4" });
      return createReadStream(cfg.file).pipe(res);
    }
    if (req.headers["x-api-key"] !== key) return send(res, 401, { error: "Invalid or missing API key" });
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    if (req.method === "POST" && p === "/api/video/generate") {
      fake.posts.push(body);
      const s = cfg.submit;
      if (s === "hang") return;
      if (s === "hang-after-create") { create(body); return; }
      if (s === "500") return send(res, 500, { error: "boom" });
      if (s.startsWith("reject:")) return send(res, Number(s.slice(7)), { error: `rejected ${s.slice(7)}` });
      const id = create(body);
      return send(res, 202, { task_id: id, status: "pending", poll_url: `/api/status/${id}` });
    }
    const st = /^\/api\/status\/([^/]+)$/.exec(p);
    if (req.method === "GET" && st) {
      fake.statusCalls++;
      const t = fake.tasks.get(st[1]);
      if (!t || cfg.statuses === "gone") return send(res, 404, { error: "Task not found" });
      const steps = cfg.statuses;
      const step = steps[Math.min(t.step++, steps.length - 1)];
      const base = { task_id: st[1], type: "video", prompt: t.prompt.slice(0, 50), created_at: t.created_at };
      if (step === "completed") return send(res, 200, { ...base, status: "completed", completed_at: Date.now() / 1000, results: Array.from({ length: t.res }, () => `${fake.url}/api/files/clip-${st[1]}.mp4`) });
      if (typeof step === "object" && step.failed) return send(res, 200, { ...base, status: "failed", ...step.failed });
      return send(res, 200, { ...base, status: step });
    }
    if (req.method === "GET" && p === "/api/tasks" && (fake.tasksCalls++, cfg.tasks === "hang")) return;
    if (req.method === "GET" && p === "/api/tasks") return send(res, 200, { tasks: [...fake.tasks].map(([task_id, t]) => ({ task_id, type: "video", status: "running", prompt: t.prompt.slice(0, 50), created_at: t.created_at })) });
    const sp = /^\/api\/stop\/([^/]+)$/.exec(p);
    if (req.method === "POST" && sp) { fake.stops.push(sp[1]); return send(res, 200, { stopped: [sp[1]], skipped: [], count: 1 }); }
    send(res, 404, { error: "not found" });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  fake.url = `http://127.0.0.1:${server.address().port}`;
  fake.close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
  return fake;
}

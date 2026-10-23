# Cắm thêm tính năng vào Studio

Studio có sẵn các chỗ cắm dưới đây. Một tính năng mới thường chỉ cần thêm file mới vào đúng thư mục, không phải sửa `server.mjs` hay `public/app.js`. Mỗi mục có một ví dụ chạy được: chép nguyên file vào đúng chỗ, khởi động lại Studio là thấy.

| Chỗ cắm | Thư mục | Hợp đồng nằm ở |
|---|---|---|
| Route HTTP | `routes/*.mjs` | `lib/routes.mjs` |
| Giao diện (tab, mục, inspector, popover agent, timeline, icon) | `public/ext-*.js`, `public/ext-*.css` | `public/ext.js`, `public/panels.js`, `public/inspector.js`, `public/agent.js`, `public/timeline.js`, `public/icons.js` |
| Tool (cho đạo diễn và MCP client) | `lib/tools/*.mjs` | `lib/tools.mjs` |
| Kiểm chất lượng đầu ra | `lib/quality/*.mjs` | `lib/quality.mjs` |
| Biên nhận đầu ra | gọi `writeReceipt` | `lib/receipts.mjs` |
| Agent CLI (chữ, đọc ảnh, sinh ảnh) | `lib/agents/cli/*.mjs` | `lib/agents/index.mjs`, xem [agents.md](agents.md) |
| Lệnh của provider | `P.commands.*` | `lib/provider.mjs` |

Các module được nạp theo thứ tự tên file. Tên trùng (route, tool, id kiểm) làm Studio dừng ngay lúc khởi động và báo file nào trùng, để lỗi không lọt vào lúc đang dùng.

## Route HTTP

Mỗi `routes/*.mjs` export `ROUTES`:

```js
// routes/hello.mjs
export const ROUTES = [
  {
    method: "GET", path: "/api/hello", provider: false,
    handler: async (c) => ({ hello: c.q("who") ?? "bạn" }),
  },
  {
    method: "POST", path: "/api/hello/note",
    async handler(c) {
      const p = c.withManifest(c.body.name);
      if (p.error) return c.send(p.status, { error: p.error });
      return { dir: p.dir, text: String(c.body.text ?? "") };
    },
  },
];
```

- `path` bắt đầu bằng `/api/`. `prefix: true` khớp cả các đường dưới nó.
- `provider: false` cho route chạy khi chưa cài provider. Mặc định route cần provider và trả 503 khi chưa có.
- Route của Studio luôn được thử trước. Route mở rộng chỉ chạy ngay trước 404, nên không đè được route có sẵn. Đường trùng route có sẵn hoặc trùng route mở rộng khác làm `createServer` báo lỗi "trùng".
- POST cần header `x-studio-token`, giống mọi POST khác. Server kiểm trước khi gọi handler.
- Handler nhận `c = { req, res, url, q(k), body, send(status, body, headers?), projectDir(name), withManifest(name), root, token, P, why, startJob, runtimeFor }`. `projectDir` và `withManifest` trả `{ dir }` hoặc `{ status, error }`. Trả một giá trị thì Studio gửi nó dạng JSON 200. Ném lỗi có `.status` thì Studio trả status đó kèm `{ error }`.
- Việc dài thì chạy thành job để hiện trong giao diện: `c.startJob({ name, kind, cmd: process.execPath, args, cwd, meta, onLine })`. Mỗi dự án chỉ chạy một job mỗi `kind` một lúc; job thứ hai ném lỗi `code: "BUSY"`. Ví dụ đầy đủ ở `routes/agents.mjs`.

Test có thể truyền danh sách route riêng: `createServer({ root, token, routes: await loadRoutes(dir) })`.

## Giao diện

`GET /api/extensions` liệt kê `public/ext-*.js` và `public/ext-*.css` (tên chữ thường, gạch nối). `public/ext.js` gắn từng file CSS, `import()` từng file JS rồi gọi `register(studio)`. Một extension lỗi chỉ hiện một toast ghi tên file; các extension khác vẫn chạy.

```js
// public/ext-hello.js
export function register(studio) {
  const { ctx, h } = studio;

  // Icon: một chuỗi path SVG 24×24, hoặc danh sách [tag, attrs].
  studio.icon("hello", "M4 12h16M12 4v16");

  // Tab sau sáu tab có sẵn. view(helpers) trả một node hoặc một danh sách node.
  // Alt+1…9 chọn tab theo thứ tự; ?tab=hello mở thẳng tab này.
  studio.addTab({
    id: "hello", label: "Chào", lead: "Ví dụ extension", icon: "hello",
    badge: () => ctx.state.jobs.length,
    view: ({ h, empty, needManifest }) => (ctx.state.m ? h("p", {}, `Dự án: ${ctx.state.name}`) : needManifest()),
  });

  // Mục ở cuối một tab có sẵn (director, media (tab Footage), lines, music, library, export) hoặc tab mở rộng.
  studio.addSection("media", { id: "hello-note", order: 50, view: ({ h }) => h("p", { class: "note" }, "Mục thêm vào tab Footage") });

  // Mục ở cuối inspector khi chọn shot, line, music hoặc event.
  studio.addInspectorSection({ kinds: ["shot"], view: (pick, m) => h("p", { class: "muted" }, `Shot ${pick.id}`) });

  // Dòng trong popover của chip agent. reload() vẽ lại popover.
  studio.addAgentRows((data, { reload, h }) => [h("p", { class: "muted" }, "Dòng thêm vào popover")], { width: "520px" });

  // Dấu chỉ để xem trên timeline: dải từ t đến until, hoặc vạch mảnh tại t.
  studio.addTimelineDecorator((m, state) => [{ t: 1, until: 2.5, lane: "voice", label: "đoạn cần xem", kind: "warn" }]);

  studio.toast("Extension hello đã chạy");
}
```

- `studio = { ctx, h, toast, addTab, addSection, addInspectorSection, addAgentRows, addTimelineDecorator, icon }`.
- `ctx.api(path)` gọi GET và trả JSON, lỗi thì ném. `ctx.send(path, body)` gọi POST có token và trả `{ status, ...json }`. `ctx.state` giữ dự án đang mở (`name`, `m` là manifest, `pick` là mục đang chọn, `jobs`). `ctx.on("project", fn)` báo khi đổi dự án.
- Helper của view tab và mục: `{ h, empty, needManifest, loading, fail, select, render }`. View ném lỗi thì chỉ phần đó hiện lỗi, panel vẫn chạy.
- `lane` của timeline là `shot`, `voice`, `music` hoặc `sfx`. Dấu chỉ để xem, không sửa `project.json`.
- `app.css` là của Studio. Extension dùng file `public/ext-<tên>.css` riêng hoặc style inline.

### Kéo footage

Một dòng footage kéo đi với kiểu `text/x-ms-media` (hằng `MEDIA_DRAG` trong `public/panels.js`), dữ liệu là JSON `{ rel, kind, path }`: `rel` là đường trong dự án (có thể null), `kind` là loại media, `path` là đường tuyệt đối. Kèm `text/plain` là `rel` hoặc `path`.

```js
import { MEDIA_DRAG } from "/panels.js";
el.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes(MEDIA_DRAG)) e.preventDefault(); });
el.addEventListener("drop", (e) => { const media = JSON.parse(e.dataTransfer.getData(MEDIA_DRAG)); /* media.rel, media.kind */ });
```

## Tool

Tool là một việc đạo diễn AI hoặc MCP client gọi được. Mỗi `lib/tools/*.mjs` export `TOOLS`:

```js
// lib/tools/hello.mjs
export const TOOLS = [
  {
    name: "project_hello",
    title: "Chào dự án",
    description: "Trả tên thư mục của một dự án.",
    inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string" } } },
    mutates: false, provider: false,
    async run({ project }, env) { return { dir: env.projectDir(project) }; },
  },
];
```

```js
import { callTool, toolEnv } from "./lib/tools.mjs";
const r = await callTool("project_hello", { project: "abm-intro" }, toolEnv({ root: "/Volumes/2/Edit-Video" }));
// { ok: true, result: { dir: "…/abm-intro" } } hoặc { ok: false, error }
```

- `name` khớp `^[a-z][a-z0-9_]{2,40}$`. `inputSchema` là JSON Schema kiểu object. `callTool` kiểm trường bắt buộc, kiểu cơ bản, `items` và `enum` trước khi chạy.
- `env = { root, P, projectDir(name), studio }`. `projectDir` ném lỗi 400 hoặc 404. `insideProject(dir, rel, what, { mustExist })` (cùng file) đổi đường tương đối thành đường tuyệt đối trong dự án và chặn `..`, file chấm và symlink ra ngoài.
- `mutates: true` khi tool ghi file. `provider: true` khi tool cần provider; thiếu provider thì `callTool` trả lỗi.
- Việc dài (sinh ảnh, render) đi qua Studio đang chạy để hiện thành job: `env.studio.post("/api/…", body)` rồi đọc `env.studio.get("/api/jobs?name=…")`. Chưa chạy Studio thì `studioClient` ném lỗi 503 "Studio chưa chạy". Xem `image_generate` trong `lib/tools/agents.mjs`.

## Kiểm chất lượng

Mỗi `lib/quality/*.mjs` export `CHECKS`. Studio chạy các kiểm này cho mọi file trong biên nhận.

```js
// lib/quality/png-size.mjs
import { statSync } from "node:fs";
export const CHECKS = [
  {
    id: "image-under-20mb",
    applies: (file, kind) => kind === "image",
    run: (file) => { const mb = statSync(file).size / 1e6; return { pass: mb < 20, detail: `${mb.toFixed(1)} MB` }; },
  },
];
```

`kind` là `image`, `video`, `audio` hoặc `other`, lấy theo đuôi file. `run` có thể là async. Kiểm ném lỗi thì tính là không đạt và lỗi thành `detail`. Có sẵn hai kiểm: `exists-nonempty` (file có và lớn hơn 0 byte) và `probe-readable` (ffprobe đọc được ảnh, video, âm thanh).

## Biên nhận

Mỗi file Studio tạo ra (ảnh sinh, bản xuất) nên có một biên nhận: cái gì tạo ra nó, sha256 và kích thước, kết quả kiểm.

```js
import { listReceipts, writeReceipt } from "./lib/receipts.mjs";
const started = new Date();
// … tạo /abs/project/assets/hero.png …
const r = await writeReceipt(projectDir, {
  op: "image-generate", actor: "human", tool: { name: "codex-pool" },
  params: { prompt }, inputs: { refs: [] }, outputs: ["/abs/project/assets/hero.png"], started,
});
// r.file = ".opus/receipts/20261023/image-generate-<id>.json", r.pass, r.checks
listReceipts(projectDir, { op: "image-generate", limit: 10 }); // mới nhất trước
```

- `op` khớp `^[a-z][a-z0-9-]{1,40}$`. `outputs` là đường tuyệt đối.
- Biên nhận nằm trong `<dự án>/.opus/receipts/<yyyymmdd>/`, ghi nguyên tử (file tạm rồi đổi tên). Mọi chuỗi trong `params` và `inputs` đi qua `redact()`, nên token lỡ có trong prompt cũng bị che.

## Agent CLI

`lib/agents/index.mjs` là cách duy nhất để phần còn lại của Studio nhờ agent CLI trên máy viết chữ, đọc ảnh hay sinh ảnh:

```js
import { complete, describeImages, generateImage, listAgents } from "./lib/agents/index.mjs";
await generateImage({ prompt, refs: [], out: "/abs/project/assets/hero.png", project: "/abs/project", actor: "director" });
await describeImages({ images: ["/abs/a.png"], prompt: "Ảnh có chữ không?", schema: { type: "object", properties: { text: { type: "boolean" } } } });
await complete({ prompt: "…", schema: null });
```

Thứ tự thử, fallback và cách thêm CLI ở [agents.md](agents.md). Qua HTTP: `GET /api/agents`, `POST /api/agents/image`. Qua tool: `agents_list`, `image_generate`, `image_describe`.

## Lệnh của provider

`P.commands` là đường tuyệt đối tới script, chạy bằng `node <đường> …`, nên luôn chạy qua `process.execPath`:

| Khóa | Việc |
|---|---|
| `render`, `mix`, `pitch`, `import`, `demo`, `recipe`, `preflight`, `cases`, `styles` | Có từ trước |
| `timing` | Ghi mốc thời gian từ `words.json` |
| `beatGrid` | Đo nhịp nhạc nền |
| `wordSync` | Kiểm chữ chốt khớp lời |
| `sfxSync` | Kiểm SFX khớp hình |
| `cut` | Cắt footage theo EDL |
| `reframe` | Sinh bản 9:16 hoặc 1:1 |
| `qc` | Kiểm file MP4 cuối |
| `choose` | Có thể là `{ file, args }` với chỗ thay `{project}`, `{pick}` |

```js
c.startJob({ name, kind: "timing", cmd: process.execPath, args: [c.P.commands.timing, "--project", dir], cwd: dir });
```

## Đường dẫn dùng chung

- `hfSkills()` trong `lib/config.mjs`: thư mục skill HyperFrames (danh mục chuyển cảnh, script media). Mặc định `~/.claude/skills`, đổi bằng `MOTION_STUDIO_HF_SKILLS`. Studio chỉ đọc thư mục này, không ghi.
- `agentsFile()`: kết quả "Thử khả năng" của các agent, cạnh file trạng thái.
- `agentPath()`: `MOTION_STUDIO_AGENT_PATH`, đường tìm agent CLI.

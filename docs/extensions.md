# Cắm thêm tính năng vào Studio

Studio có sẵn các chỗ cắm dưới đây. Một tính năng mới thường chỉ cần thêm file mới vào đúng thư mục, không phải sửa `server.mjs` hay khung giao diện trong `ui/src/shell/`. Mỗi mục có một ví dụ chạy được: chép nguyên file vào đúng chỗ, khởi động lại Studio là thấy.

| Chỗ cắm | Thư mục | Hợp đồng nằm ở |
|---|---|---|
| Route HTTP | `routes/*.mjs` | `lib/routes.mjs` |
| Giao diện (tab trên rail, mục trong tab, inspector, hộp agent, dấu trên timeline) | `ui/src/ext/<tên>/index.ts` | `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/slots.ts` |
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

Giao diện viết bằng React + TypeScript trong `ui/src/`. Mỗi tính năng giao diện là một thư mục `ui/src/ext/<tên>/` có file `index.ts` export `register(studio)`. Không có file đăng ký chung: lúc build, `ui/src/ext/load.ts` tìm mọi `ui/src/panels/*/index.ts` rồi mọi `ui/src/ext/*/index.ts` (mỗi nhóm theo tên thư mục) và gọi `register(studio)`. Thư mục nào thiếu `register` hoặc ném lỗi thì bị bỏ qua, Studio hiện một toast "Extension lỗi, đã bỏ qua: <thư mục>: <lỗi>", các phần khác vẫn chạy.

Extension được build vào `ui/dist` cùng phần còn lại của trang. `start` build lại khi nguồn trong `ui/src` mới hơn bản build, nên thêm thư mục rồi khởi động lại Studio là thấy. Muốn build ngay thì chạy `npm --prefix ui run build`. Route `GET /api/extensions` vẫn còn để API không đổi, nhưng nay luôn trả `{ "scripts": [], "styles": [] }`: file `ext-*.js` đặt ngoài `ui/src` không còn được nạp.

Component đặt trong file `.tsx` riêng, vì loader chỉ tìm `index.ts`:

```tsx
// ui/src/ext/hello/Hello.tsx
import { useProject } from "@/api/queries.ts";
import type { AgentRowProps, InspectorSectionProps } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";

export function HelloTab() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  if (!name) return <p className="text-sm text-muted-foreground">Chọn một dự án trước.</p>;
  return <p className="text-sm">Dự án {name}: {m?.shots.length ?? 0} shot</p>;
}

export function HelloNote() {
  return <p className="text-xs text-muted-foreground">Mục thêm vào tab Chất liệu</p>;
}

export function HelloShot({ pick }: InspectorSectionProps) {
  return <p className="text-xs text-muted-foreground">Shot {pick.id}</p>;
}

export function HelloAgentRow({ data, reload }: AgentRowProps) {
  return <button type="button" className="text-xs" onClick={reload}>{data ? "Tải lại" : "Đang đọc…"}</button>;
}
```

```ts
// ui/src/ext/hello/index.ts
import { Hand } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { HelloAgentRow, HelloNote, HelloShot, HelloTab } from "./Hello.tsx";

export function register(studio: Studio): void {
  // Tab trên rail trái. group: assets, audio, library hoặc extra (mặc định); order trong nhóm.
  // Alt+1…9 chọn tab theo thứ tự trên rail; ?tab=hello mở thẳng tab này.
  studio.registerTab({ id: "hello", label: "Chào", icon: Hand, group: "extra", lead: "Ví dụ extension", component: HelloTab });

  // Mục ở cuối một tab (id của tab), của tab Đạo diễn ("director") hoặc của hộp xuất ("export").
  studio.registerSection("media", { id: "hello-note", order: 50, component: HelloNote });

  // Mục trong tab Shot của cột phải khi chọn một khối trên timeline.
  studio.registerInspectorSection({ id: "hello-shot", kinds: ["shot"], component: HelloShot });

  // Dòng trong hộp agent (bấm chip agent). width đặt bề rộng hộp, ví dụ "520px".
  studio.registerAgentRows({ component: HelloAgentRow });

  // Dấu chỉ để xem trên timeline: dải từ t đến until, hoặc vạch mảnh tại t.
  studio.registerTimelineDecorator(() => [{ t: 1, until: 2.5, lane: "voice", label: "đoạn cần xem", kind: "warn" }]);

  studio.toast("Extension hello đã chạy");
}
```

- `studio = { registerTab, registerSection, registerInspectorSection, registerAgentRows, registerTimelineDecorator, actions, api, send, toast, useStudio, bus }`. Kiểu nằm ở `ui/src/ext/registry.ts`.
- `registerTab({ id, label, icon, group?, order?, lead?, component, badge? })`: `id` khớp `^[a-z][a-z0-9-]{1,30}$`, không trùng tab khác, và không được là `ai` hay `output` (hai id này nay mở tab Đạo diễn và hộp xuất). `icon` là một component icon, thường lấy từ `lucide-react`. `badge()` trả số hiện trên nút rail (0 thì ẩn); hàm chạy lúc nút rail render nên dùng được hook, miễn là gọi cùng các hook ở mọi lần render. Thứ tự trên rail: nhóm `assets`, `audio`, `library`, `extra`, rồi `order` (mặc định 100), rồi thứ tự đăng ký.
- `registerSection(hostId, { id, order?, component })`: `hostId` là id một tab, `"director"` hay `"export"`. Các mục xếp theo `order` (mặc định 100). Mục có sẵn của tab Đạo diễn là `chat` (`order: 10`); của hộp xuất là `gates`, `jobs`, `files` (10, 20, 30); tab Chất liệu có `broll-search` (40).
- `registerInspectorSection({ id?, kinds?, order?, component })`. `kinds` là các loại khối: `shot`, `line`, `music`, `event`, `beat`, `word` (mặc định `["shot"]`). `component` nhận `{ pick, m }`: `pick` là `{ kind, id }` của khối đang chọn, `m` là manifest hoặc `null`. Phần lõi của inspector đăng ký với `order: 0`, extension mặc định `100`; với shot, các mục có sẵn là B-roll (30), chuyển cảnh (40), phong cách (50), biên nhận (60).
- `registerAgentRows({ component, width? })`: `component` nhận `{ data, error, reload }`, với `data` là kết quả `GET /api/agent` (chưa có thì `undefined`). Dòng của `ui/src/panels/` đứng trước dòng của `ui/src/ext/`.
- `registerTimelineDecorator((m, { name, sel, pick }) => DecoBand[])`: mỗi dải là `{ t, until?, lane, label, kind }`, `lane` là `shot`, `voice`, `music` hoặc `sfx`, `kind` là `info`, `warn`, `bad` hoặc `ok`. Dấu chỉ để xem, không sửa `project.json`. Hàm ném lỗi thì bị bỏ qua.
- Dữ liệu: `useStudio` (Zustand) giữ trạng thái giao diện (`name`, `pick`, `sel`, `leftTab`, …). Playhead `t` đổi mỗi khung khi đang phát, nên đọc bằng `useStudio.getState().t` hoặc `useStudio.subscribe`, không đọc bằng selector trong lúc render. Dữ liệu server lấy qua các hook trong `ui/src/api/queries.ts` (`useProject`, `useJobs`, `useRequests`, `useGates`, …). `api(path)` gọi GET và trả JSON, lỗi thì ném; `send(path, body)` gọi POST có token và trả `{ status, ...json }`; `actions` là các thao tác có sẵn (mở dự án, hoàn tác, xuất…).
- Mỗi tab, mục và mục inspector nằm trong một error boundary riêng. Component ném lỗi thì chỉ phần đó hiện lỗi; ở inspector, phần đó hiện "Mục mở rộng lỗi: <lỗi>". Đổi dự án hoặc đổi khối đang chọn thì phần đó được thử lại.
- Màu: chỉ dùng token trong `ui/src/styles/tokens.css`, qua class Tailwind (`bg-panel`, `text-muted-foreground`, `border-border`, `text-warn`, …). Canvas đọc token bằng `getComputedStyle`. Không viết mã màu thô (`#…`, `rgb()`, `hsl()`, `oklch()`) và không dùng bảng màu dựng sẵn của Tailwind (`bg-blue-500`, `text-white`…): `ui/src/styles/tokens.test.ts` chặn cả hai. Dòng thật sự cần ngoại lệ thì ghi chú `token-exempt: <lý do>` trên chính dòng đó. Extension không có file CSS riêng.

### Thẻ cổng của đạo diễn

Khi đạo diễn hỏi người dùng (`studio_ask`), tab Đạo diễn hiện một thẻ cổng (`ui/src/panels/director/GateCard.tsx`): chọn hướng, duyệt animatic hay ảnh, hoặc trả lời bằng chữ. Thẻ render với `key={cardKey(…)}`, nên khi khung chat vẽ lại, thẻ vẫn là cùng một node và animatic đang xem không chạy lại từ đầu. Trong lúc đang nhấn chuột hay Space trên một nút ở cột phải, khung chat giữ nguyên nội dung (`usePressGate`), rồi mới cập nhật khi nhả, để cú bấm không trượt vì nút bị thay giữa chừng. Thẻ chỉ người dùng bấm được; extension không trả lời thay. Muốn thêm nội dung vào tab Đạo diễn thì dùng `registerSection("director", …)` với `order` lớn hơn 10 để nằm dưới khung chat.

### Kéo footage

Một dòng footage kéo đi với kiểu `text/x-ms-media` (hằng `MEDIA_DRAG` trong `ui/src/core/dnd.ts`), dữ liệu là JSON `{ rel, kind, path }`: `rel` là đường trong dự án (có thể null), `kind` là loại media, `path` là đường tuyệt đối. Một kết quả "Tìm trong footage" gửi thêm `sha256`, `start` và `end`. Kèm `text/plain` là `rel` hoặc `path`. Dùng các hàm của cùng file thay vì tự đọc `dataTransfer`:

```tsx
import { hasMediaDrag, readMediaDrag } from "@/core/dnd.ts";

<div
  onDragOver={(e) => { if (hasMediaDrag(e)) e.preventDefault(); }}
  onDrop={(e) => { const media = readMediaDrag(e); if (media) { /* media.rel, media.kind, media.path */ } }}
/>
```

`setMediaDrag(e, item)` đặt dữ liệu lên sự kiện `dragstart`. `readMediaDrag` trả `null` khi không có dữ liệu hoặc JSON hỏng.

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

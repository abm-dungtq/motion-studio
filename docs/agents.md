# Agent CLI trên máy

Studio dò các agent CLI cài trên máy và nhờ chúng viết chữ, đọc ảnh hoặc sinh ảnh. Mọi phần của Studio đi qua một module là `lib/agents/index.mjs`, nên thứ tự thử, fallback, giới hạn số lượt chạy cùng lúc của mỗi agent và che bí mật chỉ nằm ở một chỗ.

## Xem trên giao diện

Bấm chip agent ở góc phải. Bảng "Agent CLI" có:

- CLI, phiên bản, đã đăng nhập chưa.
- Chữ, Đọc ảnh, Sinh ảnh: `có`, `không` hoặc `chưa rõ`. Dấu ✓ là đã thử thật trên máy này.
- Quota của codex-pool theo từng tài khoản (`acct1 5h 38% · tuần 12%`) và tài khoản sẽ dùng kế tiếp.
- Thứ tự thử cho từng việc.

"Làm mới" quét lại ngay, bỏ cache 60 giây. "Thử khả năng" chạy thật một lần việc đã chọn trên agent đã chọn, nên tốn quota của agent đó. Chỉ cú bấm này mới chạy thử. Kết quả lưu vào `agents.json` cạnh file trạng thái (chmod 600). Từ đó cột của khả năng ấy theo kết quả thử, không theo giá trị mặc định.

Studio chỉ hiện trạng thái. Email, tên tổ chức, token và nội dung file đăng nhập không bao giờ rời adapter. Mọi chuỗi trong kết quả quét còn đi qua `redact()` (`lib/agents/redact.mjs`).

## Các CLI Studio biết

| id | Chạy được | Mặc định |
|---|---|---|
| `claude` | chữ, đọc ảnh | sinh ảnh: không |
| `codex-pool` | chữ, đọc ảnh, sinh ảnh | chạy `codex` qua nhiều tài khoản, cân quota |
| `codex` | chữ, đọc ảnh, sinh ảnh | bị bỏ qua khi codex-pool chạy được, để mọi lượt Codex đều được cân quota |
| `agy` | chữ; đọc ảnh và sinh ảnh "chưa rõ" cho tới khi thử | |
| `gemini`, `opencode`, `cursor-agent` | theo adapter, chưa kiểm trên máy thật | |
| `goose`, `devin`, `grok`, `pi`, `omp`, `openclaw`, `hermes`, `cx-image-generate` | chỉ dò phiên bản, không chạy | `cx-image-generate` còn không được gọi `--version` |

Studio tìm CLI trong `PATH`, rồi `~/.local/bin`, `~/.opencode/bin`, `/opt/homebrew/bin`, `/usr/local/bin`. Đặt `MOTION_STUDIO_AGENT_PATH` thì chỉ tìm trong đường đó. Một shim hỏng (symlink treo, file không chạy được) hiện là "lỗi" chứ không phải "không thấy".

## Thứ tự thử

Mặc định:

| Việc | Thứ tự |
|---|---|
| Sinh ảnh | codex-pool → codex → agy → gemini |
| Đọc ảnh | agy → codex-pool → claude → gemini |
| Chữ | agy → codex-pool → claude → opencode |

Một agent bị bỏ qua khi không thấy, bị lỗi, chưa đăng nhập, có khả năng ấy là `không`, hoặc (codex-pool) không còn tài khoản nào chạy được. Agent `có` đứng trước agent `chưa rõ`. Hết quota hay chạy lỗi thì chuyển sang agent kế tiếp. Agent từ chối yêu cầu thì dừng và báo lý do, không thử agent khác. Mỗi lượt chạy trong một thư mục tạm riêng, xong thì xoá.

### Số lượt chạy cùng lúc

Trong một tiến trình, mỗi agent chạy tối đa N lượt cùng lúc; lượt thứ N+1 chờ tới lượt theo thứ tự gọi. N lấy theo thứ tự:

1. `agents.parallel[<id>]` trong file trạng thái, số nguyên 1–4 (giá trị khác bị bỏ qua).
2. Hàm `parallel(row)` của adapter, nếu có, giới hạn trong 1–4. codex-pool trả số tài khoản đang chạy được trong lần quét (`acct1: OK`, …).
3. Mặc định 1.

Vậy codex-pool có hai tài khoản còn lượt thì vẽ hai ảnh một lúc, còn một tài khoản thì lần lượt. Một tài khoản chạy được vài lượt song song, nên có thể nâng lên:

```json
{ "agents": { "parallel": { "codex-pool": 4 } } }
```

Giới hạn này tính trong một tiến trình: đợt ảnh (`docs/assets.md`) chạy cả đợt trong một tiến trình con nên tuân theo nó; hai việc khác nhau của Studio (một ảnh lẻ và một đợt) là hai tiến trình, mỗi cái có giới hạn riêng.

Đổi thứ tự trong file trạng thái (`~/.config/motion-studio/studio.json`, hoặc `MOTION_STUDIO_STATE`):

```json
{ "agents": { "order": { "image": ["agy", "codex-pool"], "vision": ["claude", "agy"] } } }
```

Khoá nào không ghi thì giữ mặc định. Studio đọc lại thứ tự ở mỗi lượt gọi, không cần khởi động lại.

## Gọi từ code

```js
import { complete, describeImages, generateImage, listAgents, slotsOf } from "./lib/agents/index.mjs";

const scan = await listAgents();              // { agents, order, at }; cache 60 s, { refresh: true } quét lại
const img = await generateImage({ prompt: "một con mèo thuỷ màu", out: "/abs/pj/assets/cat.png", project: "/abs/pj", actor: "director" });
// { ok, file, agent, receipt, tried: [{ id, error, quota? }] }; tên đã có thì thêm -2, -3
const seen = await describeImages({ images: ["/abs/pj/assets/cat.png"], prompt: "Có chữ trong ảnh không?", schema: { type: "object", properties: { text: { type: "boolean" } } } });
// { ok, json, text, agent, tried }
const txt = await complete({ prompt: "Ba ý cho cảnh mở đầu", schema: null });
const n = await slotsOf("codex-pool");   // số lượt codex-pool được chạy cùng lúc (1–4)
```

- `refs` đính ảnh tham chiếu, `edit: true` sửa `refs[0]` giữ khung, `size` như `1024x1024`, `agent` ép dùng một agent.
- Sinh ảnh ghi biên nhận vào `<dự án>/.opus/receipts/` (xem [extensions.md](extensions.md#biên-nhận)).
- Thời gian chờ mặc định: sinh ảnh 6 phút, đọc ảnh và chữ 3 phút. Hết giờ thì Studio dừng cả nhóm tiến trình của CLI.

Qua HTTP (POST cần `x-studio-token`):

| Đường | Việc |
|---|---|
| `GET /api/agents` (`?refresh=1`) | Kết quả quét và job thử gần nhất (`probe`) |
| `POST /api/agents/refresh` | Quét lại |
| `POST /api/agents/probe {id, cap}` | Job `agent-probe`: chạy thử một lần |
| `POST /api/agents/image {name, prompt, out, refs?, edit?, size?, agent?}` | Job `image` của dự án; dòng cuối log là `RESULT <json>` |

Qua tool: `agents_list`, `image_generate`, `image_describe` (`lib/tools/agents.mjs`).

Từ dòng lệnh: `node lib/agents/index.mjs probe <id> <text|vision|image>`.

## Thêm một CLI

Thêm `lib/agents/cli/<tên>.mjs`, export default một adapter (hoặc danh sách adapter):

```js
// lib/agents/cli/mycli.mjs
import { detectBin, exec } from "../run.mjs";

export default {
  id: "mycli", label: "My CLI", rank: 50, bins: ["mycli"],
  caps: { text: "yes", vision: "unknown", image: "no" },
  detect: ({ env }) => detectBin(["mycli"], { env }),
  async auth({ env, bin }) {
    const r = await exec(bin, ["whoami", "--json"], { env, timeout: 5000 });
    return { logged_in: r.code === 0 ? true : null, method: null }; // chỉ trạng thái, không trả tên tài khoản
  },
  run: {
    async text({ env, bin }, req) {
      const r = await exec(bin, ["ask", "-"], { env, stdin: req.prompt, cwd: req.cwd, timeout: req.timeout });
      return { ...r, text: r.stdout.trim() };
    },
  },
};
```

- `caps` là giá trị mặc định: `yes`, `no` hoặc `unknown`. "Thử khả năng" ghi đè giá trị này bằng kết quả thật.
- `auth` và `quota` chỉ được trả boolean, số đếm, id model và phần trăm. Không trả email, tên tổ chức hay token.
- `exec` chạy không qua shell, trong một nhóm tiến trình riêng, hết giờ thì SIGTERM rồi SIGKILL.
- Thêm id vào `agents.order` trong `studio.json` để router thử agent mới. Agent không có trong thứ tự chỉ hiện trong bảng.

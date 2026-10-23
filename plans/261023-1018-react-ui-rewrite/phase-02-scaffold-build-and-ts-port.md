# Phase 2: khung `ui/`, token tối, server phục vụ `ui/dist`, build khi cũ, port logic sang TS

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui` (gọi tắt `$W`)
- **Nhánh:** `feat/react-ui`
- **Cổng thử:** 4410
- **Effort:** 8h
- **Phụ thuộc:** không. Task 2.0 chạy trước tiên; ngay khi task 2.0 commit, phase 1 bắt đầu **song song** trong worktree riêng. Phase 2 không đụng `ui/scripts/` hay thư mục plan, là chỗ của phase 1.
- **Cách giao:** phase 2 là xương sống, commit thẳng lên `feat/react-ui` rồi `git push`. Không mở PR riêng.

## Mục tiêu

1. `ui/` dựng bằng Vite + React + TypeScript + Tailwind v4 + shadcn/ui, có hệ token tối. Component chỉ dùng token.
2. Server phục vụ `ui/dist` ở `/` và `/assets/*`. Đây là đổi file tĩnh, **không** đổi API: không route `/api/*` nào đổi, `BUILTIN` giữ nguyên.
3. `setup` cài và build UI. `start` build lại khi nguồn mới hơn bản build. `ui/dist` không vào git.
4. Logic thuần của UI cũ port sang `ui/src/core/*.ts`, giữ nguyên logic. Test cũ chạy trên bản TS và vẫn xanh.

## Hiện trạng đã kiểm

- `server.mjs:51` `const PUBLIC = join(HERE, "public")`.
- `server.mjs:303-306`: `GET /` và `/index.html` đọc `public/index.html`, thay `__STUDIO_TOKEN__` bằng token.
- `server.mjs:307`: phục vụ `public/<tên>.js|css` khi khớp `PUBLIC_FILE` (`lib/routes.mjs:21`, `^\/[a-z-]+\.(js|css)$`).
- `server.mjs:150`: `createServer({ root, token, runtime, run, mediaRoots, routes })` đã có tuỳ chọn riêng cho test. Phase này thêm `ui` theo cùng kiểu.
- `server.mjs:182` `serveFile(req, res, file, { inject })`.
- `tests/routes-seam.test.mjs:129-136` so `BUILTIN` với mọi `p === "…"` trong `route()`. Vì vậy nhánh mới cho `/assets/` phải dùng `p.startsWith("/assets/")`, không dùng `p === …`.
- `tests/studio-server.test.mjs:91-97` và `tests/no-provider.test.mjs:45-50` đòi `GET /` trả 200, có token, có `<title>Motion Studio</title>`.
- `lib/timing-edit.mjs:15` (server) import `beatBounds`, `wordBounds` từ `../public/timeline-edit.js`.
- Test import mã UI:
  - `tests/gate-cards.test.mjs:3` → `../public/gate-cards.js`;
  - `tests/timeline-edit.test.mjs:3`, `tests/timeline-ripple.test.mjs:8`, `tests/timeline-lanes.test.mjs:6` → `../public/timeline-edit.js`;
  - `tests/ui-extensions.test.mjs:59` → `../public/ext-agents.js` (`poolLines`).
- `tests/provider.test.mjs:73-86` duyệt mọi file text trong repo. `skipDirs` chỉ so đường tương đối đúng bằng `node_modules`, nên sẽ đi vào `ui/node_modules`. Tập đuôi `text` không có `.ts`, `.tsx`.
- `bin/motion-studio.mjs:154-158` nhánh `setup`; `:90-125` `start()`: kiểm `live()`, rồi `portOwner()` ở `:101`, rồi `serve` hoặc spawn con `--child`.
- README `:11` ghi "Node.js 20 trở lên. Không có dependency npm, không có bước build." Phase 7 sửa dòng này.
- Node trên máy 24.18.0, `process.features.typescript` = `strip`. Đã thử `node --test` với test `.mjs` import `./a.ts`: `pass 1`, không cảnh báo.

## Sở hữu file

**Sửa (task 2.0):** `tests/fixtures/lemo/make.mjs`.

**Tạo mới:**
- `ui/package.json`, `ui/package-lock.json`;
- `ui/index.html`, `ui/vite.config.ts`, `ui/tsconfig.json`, `ui/components.json`;
- `ui/src/main.tsx`, `ui/src/styles/tokens.css`, `ui/src/styles/index.css`, `ui/src/styles/tokens.test.ts`;
- `ui/src/lib/utils.ts`, `ui/src/components/ui/*.tsx` (9 component shadcn);
- `ui/src/core/timeline-edit.ts`, `gate-cards.ts`, `pool-lines.ts`, `format.ts`, `timeline-lanes.ts`, `markers.ts`, `peaks-cache.ts`, `waveform.ts`, `thumbs.ts`;
- `lib/ui-build.mjs`;
- `tests/ui-build.test.mjs`, `tests/ui-static.test.mjs`, `tests/ui-core-rules.test.mjs`;
- `tests/fixtures/ui-dist/index.html`, `tests/fixtures/ui-dist/assets/app-test.js`.

**Sửa:**
- `server.mjs`: chỉ phần file tĩnh và comment đầu file;
- `bin/motion-studio.mjs`, `lib/timing-edit.mjs` (một dòng import);
- `package.json`, `.gitignore`;
- `tests/gate-cards.test.mjs`, `tests/timeline-edit.test.mjs`, `tests/timeline-ripple.test.mjs`, `tests/timeline-lanes.test.mjs`, `tests/ui-extensions.test.mjs`: chỉ dòng import;
- `tests/provider.test.mjs`: chỉ hàm duyệt;
- `tests/studio-server.test.mjs`, `tests/no-provider.test.mjs`: chỉ thêm tuỳ chọn `ui` vào `createServer`.

**Không đụng:** `ui/scripts/**` và `plans/**` trừ `plans/261023-1018-react-ui-rewrite/reports/phase-02-report.md` (phase 1 đang làm song song), `public/**`, `routes/**`, `lib/routes.mjs`, `lib/setup.mjs`, mọi route `/api`.

## Luồng dữ liệu

```text
setup:  bin main → ensureUi({ install: true }) → [npm ci --prefix ui nếu thiếu node_modules hoặc lockfile mới hơn]
                                               → [vite build nếu nguồn mới hơn ui/dist/index.html]
        → runSetup(provider) như cũ (mã thoát giữ nguyên)
start:  live()? → đang chạy thì in URL, thoát 0 (không build)
        → ensureUi({ install: thiếu node_modules }) → build lỗi mà có dist cũ: cảnh báo, chạy tiếp
                                                    → build lỗi, không có dist: thoát 1, in "npm run setup"
        → portOwner() → serve / spawn --child (con không build lại)
GET /             → <ui>/index.html, thay __STUDIO_TOKEN__ ; thiếu file → 503 text hướng dẫn
GET /assets/<f>   → <ui>/assets/<f> (tên ^[A-Za-z0-9._-]+$, realpath phải nằm trong <ui>/assets) ; không có → 404
GET /<tên>.js|css → public/ như cũ (để test ui-extensions còn xanh; phase 5 bỏ)
<ui> = createServer({ ui }) ?? <repo>/ui/dist
```

## Các task

### Task 2.0 — Worktree, sửa fixture lemo, ghi baseline (chạy trước phase 1)

- **Mục tiêu:** `feat/react-ui` có trên GitHub và `npm test` xanh, để phase 1 cắt nhánh từ đây.
- **File:** `tests/fixtures/lemo/make.mjs`, hàm `makeLibrary`.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui -b feat/react-ui origin/main`. Từ đây `$W` = `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui`.
  3. Trong `makeLibrary`, ngay trước dòng `writeFileSync(join(dir, "docs", "frames", "watercolor.jpg"), JPEG);` (`tests/fixtures/lemo/make.mjs:21`), thêm `mkdirSync(join(dir, "docs", "frames"), { recursive: true });`. `mkdirSync` đã được import ở dòng 5.
  4. `cd $W && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`. Ghi bốn dòng này vào `$W/plans/261023-1018-react-ui-rewrite/reports/phase-02-report.md` (file báo cáo riêng của phase 2, không phải file phase 1 tạo).
  5. Ghi `git -C $W rev-parse --short origin/main` vào `reports/phase-02-report.md`; task 2.4 dùng hash này trong comment đầu file port.
  6. Commit `test(lemo): create docs/frames before writing fixture frames`, rồi `git -C $W push -u origin feat/react-ui`.
  7. Báo orchestrator: "task 2.0 xong, phase 1 bắt đầu được".
- **Đạt khi:** `ℹ fail 0`; nhánh có trên origin.
- **Verify:** `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in đúng `ℹ fail 0`. Kỳ vọng `ℹ pass 298`; số khác mà vẫn `fail 0` thì vẫn đạt, ghi số thật. Thêm `git -C $W ls-remote --heads origin feat/react-ui | wc -l` in `1`.

### Task 2.1 — Cài dependency và khung Vite

- **Mục tiêu:** `npm --prefix ui run build` tạo `ui/dist/index.html`.
- **File:** `ui/package.json`, `ui/package-lock.json`, `ui/index.html`, `ui/vite.config.ts`, `ui/tsconfig.json`, `ui/src/main.tsx`.
- **Các bước:**
  0. Tạo `ui/package.json` = `{ "name": "motion-studio-ui", "private": true, "type": "module", "scripts": {} }`.
  1. Cài dependency chạy trên trình duyệt (bản ổn định mới nhất, `--save-exact`):

     ```bash
     npm --prefix $W/ui install --save-exact react react-dom @tanstack/react-query zustand lucide-react sonner react-resizable-panels class-variance-authority clsx tailwind-merge
     ```

  2. Cài dependency build và test:

     ```bash
     npm --prefix $W/ui install --save-dev --save-exact vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom playwright-core
     ```

     `playwright-core` không tải trình duyệt khi cài. Script của phase 1 (`ui/scripts/*.mjs`) nạp nó từ đây sau khi hai nhánh gộp. Đây là danh sách dependency **đóng băng**: sau phase 3 không nhánh nào được thêm dependency (xem hợp đồng chung trong `plan.md`).

  3. `ui/package.json` thêm `"scripts": { "build": "vite build", "typecheck": "tsc --noEmit", "test": "tsc --noEmit && vitest run" }`.
  4. `ui/tsconfig.json`:
     - `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"jsx": "react-jsx"`;
     - `"strict": true`, `"noEmit": true`, `"allowImportingTsExtensions": true`, `"erasableSyntaxOnly": true`, `"verbatimModuleSyntax": true`, `"skipLibCheck": true`;
     - `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]`;
     - `"baseUrl": "."`, `"paths": { "@/*": ["src/*"] }`, `"include": ["src", "vite.config.ts"]`.
     - `erasableSyntaxOnly` cần TypeScript 5.8 trở lên. Kiểm `npx --prefix $W/ui tsc --version`.
  5. `ui/vite.config.ts`:
     - plugin `react()` và `tailwindcss()`;
     - `resolve.alias` `@` → `src`;
     - `build: { outDir: "dist", emptyOutDir: true, assetsDir: "assets" }`;
     - `test: { environment: "jsdom", globals: true, include: ["src/**/*.test.{ts,tsx}"], setupFiles: [] }`.
  6. `ui/index.html`:
     - `<html lang="vi" class="dark">`;
     - `<meta name="studio-token" content="__STUDIO_TOKEN__">`;
     - `<title>Motion Studio</title>`;
     - favicon y hệt dòng `<link rel="icon" …>` của `public/index.html:8`;
     - `<div id="root"></div>`, `<script type="module" src="/src/main.tsx"></script>`.
  7. `ui/src/main.tsx`: `import "./styles/index.css";` rồi render `<div className="h-screen bg-background text-foreground">Motion Studio</div>` vào `#root`. Phase 3 thay bằng `<App/>`.
- **Đạt khi:** build tạo `ui/dist/index.html` vẫn còn chuỗi `__STUDIO_TOKEN__`, và có ít nhất một file `ui/dist/assets/*.js`.
- **Verify:** `npm --prefix $W/ui run build` thoát 0. Rồi `grep -c __STUDIO_TOKEN__ $W/ui/dist/index.html` in `1`. Rồi `ls $W/ui/dist/assets/*.js | wc -l` in số ≥ `1`.

### Task 2.2 — Token tối, Tailwind và shadcn

- **Mục tiêu:** một bộ token duy nhất; 9 component shadcn dùng token đó.
- **File:** `ui/src/styles/tokens.css`, `ui/src/styles/index.css`, `ui/components.json`, `ui/src/lib/utils.ts`, `ui/src/components/ui/*.tsx`.
- **Các bước:**
  1. `tokens.css` khai báo trong `:root` (chỉ có theme tối). Giá trị lấy theo ảnh mockup:

     | Token | Giá trị | Dùng cho |
     |---|---|---|
     | `--ms-bg` | `#111216` | nền app |
     | `--ms-panel` | `#17181d` | thanh trên, rail, panel, cột phải |
     | `--ms-panel-2` | `#1e2026` | ô, thẻ, ô nhập |
     | `--ms-border` | `#2a2d35` | đường kẻ |
     | `--ms-text` | `#e6e8ee` | chữ |
     | `--ms-muted` | `#9097a3` | chữ phụ |
     | `--ms-accent` | `#3b82f6` | nút chính, tab đang mở |
     | `--ms-accent-text` | `#ffffff` | chữ trên accent |
     | `--ms-warn` | `#e5b62b` | thẻ cần duyệt, chấm báo |
     | `--ms-danger` | `#ef4444` | lỗi |
     | `--ms-ok` | `#22c55e` | đạt |
     | `--ms-stage` | `#000000` | khung xem trước |
     | `--ms-playhead` | `#ff4d4f` | playhead, vạch hít |
     | `--ms-track-shot` | `#2d4a8a` | khối shot |
     | `--ms-track-broll` | `#6b5523` | khối B-roll |
     | `--ms-track-voice` | `#22704a` | khối giọng, sóng giọng |
     | `--ms-track-music` | `#7b2a52` | khối nhạc, sóng nhạc |
     | `--ms-track-sfx` | `#4b2f8f` | khối SFX |
     | `--ms-deco-info`, `--ms-deco-warn`, `--ms-deco-bad`, `--ms-deco-ok` | bốn giá trị `rgba` của `DECO` ở `public/timeline.js:36` | dải trang trí timeline |
     | `--ms-radius` | `6px` | bo góc |

  2. Cũng trong `tokens.css`, ánh xạ biến của shadcn sang token: `--background: var(--ms-bg)`, `--foreground: var(--ms-text)`, `--card`, `--popover: var(--ms-panel)`, `--primary: var(--ms-accent)`, `--primary-foreground: var(--ms-accent-text)`, `--secondary`, `--muted: var(--ms-panel-2)`, `--muted-foreground: var(--ms-muted)`, `--accent: var(--ms-panel-2)`, `--destructive: var(--ms-danger)`, `--border`, `--input: var(--ms-border)`, `--ring: var(--ms-accent)`, `--radius: var(--ms-radius)`.
  3. `index.css`: `@import "tailwindcss";`, `@import "./tokens.css";`, rồi `@theme inline { … }` cho mỗi token một `--color-<tên>` (ví dụ `--color-panel: var(--ms-panel)`, `--color-track-shot: var(--ms-track-shot)`) và các `--color-*` mà shadcn cần. Thêm `html, body, #root { height: 100%; }` và `body { background: var(--ms-bg); color: var(--ms-text); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }`. Không tải web font, để chạy được offline.
  4. `components.json` (style `new-york`, `tsx: true`, `rsc: false`, `tailwind.css: "src/styles/index.css"`, `tailwind.baseColor: "neutral"`, `tailwind.cssVariables: true`, `aliases.components: "@/components"`, `aliases.utils: "@/lib/utils"`, `aliases.ui: "@/components/ui"`, `iconLibrary: "lucide"`).
  5. `ui/src/lib/utils.ts`: hàm `cn` (clsx + tailwind-merge), như shadcn sinh.
  6. `cd $W/ui && npx shadcn@latest add tabs dialog dropdown-menu tooltip resizable scroll-area select slider sonner --yes`. Không thêm component nào khác.
  7. Sửa `ui/src/components/ui/sonner.tsx`: bỏ `next-themes`, đặt `theme="dark"`. Nếu CLI đã cài `next-themes` thì gỡ: `npm --prefix $W/ui uninstall next-themes`.
  8. Kiểm `react-resizable-panels` trong lockfile là bản mà `resizable.tsx` vừa sinh cần. Build ở bước Verify sẽ báo nếu lệch.
- **Đạt khi:** đúng 9 file trong `ui/src/components/ui/`, và build vẫn chạy.
- **Verify:** `ls $W/ui/src/components/ui | sort | tr '\n' ' '` in đúng `dialog.tsx dropdown-menu.tsx resizable.tsx scroll-area.tsx select.tsx slider.tsx sonner.tsx tabs.tsx tooltip.tsx `. Rồi `npm --prefix $W/ui run build` thoát 0. Rồi `grep -c next-themes $W/ui/package.json` in `0`.

### Task 2.3 — Test luật token

- **Mục tiêu:** chặn mã màu thô và lớp màu có sẵn của Tailwind trong component.
- **File:** `ui/src/styles/tokens.test.ts`.
- **Các bước:**
  1. Test (vitest, `// @vitest-environment node` ở dòng đầu) đọc mọi `ui/src/**/*.{ts,tsx}`, trừ `*.test.*`, bằng `fs`.
  2. Báo lỗi mỗi dòng khớp `/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/`, trừ khi dòng có chú thích `token-exempt: <lý do>`. Chú thích này chỉ dành cho giá trị dữ liệu, như màu khoá mặc định `#0047FF` của nhân vật anime, không dành cho style.
  3. Báo lỗi mỗi dòng khớp `/\b(bg|text|border|ring|fill|stroke|from|to|via|outline|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\d{2,3})?\b/`.
  4. Lỗi in ra `file:line` và dòng vi phạm.
- **Đạt khi:** test xanh trên mã hiện có. Nếu shadcn sinh ra lớp như `bg-black/50` cho overlay của Dialog thì đổi sang token (`bg-stage/50`).
- **Verify:** `cd $W/ui && npx vitest run src/styles/tokens.test.ts` thoát 0 và in `1 passed`. Thử âm: thêm tạm `const x = "#123456";` vào `ui/src/main.tsx`, chạy lại phải thoát khác 0, rồi xoá dòng đó.

### Task 2.4 — Port logic thuần sang `ui/src/core/*.ts`

- **Mục tiêu:** cùng logic, có kiểu, Node chạy thẳng được.
- **File:** bảng dưới.

  | Nguồn | Đích | Lấy gì |
  |---|---|---|
  | `public/timeline-edit.js` | `ui/src/core/timeline-edit.ts` | cả file |
  | `public/gate-cards.js` | `ui/src/core/gate-cards.ts` | cả file |
  | `public/ext-agents.js` | `ui/src/core/pool-lines.ts` | `poolLines` và hằng/hàm nhỏ mà nó dùng |
  | `public/dom.js` | `ui/src/core/format.ts` | `round1`, `fmt`, `fmtS`, `isMedia` (bỏ `h`, `toast`, `thumb`, `px`) |
  | `public/timeline-lanes.js` | `ui/src/core/timeline-lanes.ts` | `SFX_TIERS`, `SFX_W`, `SFX_LABEL_W`, `musicLanes`, `sfxTiers` (bỏ `acceptDrop`, `preview`, `brollBlocks`; phase 4a viết lại bằng React) |
  | `public/timeline-markers.js` | `ui/src/core/markers.ts` | `createMarkers` với `load`, `get`, `line`, `editable`, `setBeat`, `setWord`, `undo`, `wordSync` (bỏ `beatLayer`, `wordDots`; phase 4a viết lại bằng React). Tham số `ctx` có kiểu `MarkersCtx` gồm đúng những gì file cũ dùng: `state.name`, `state.m`, `editable`, `api`, `send`, `emit`, `toast` |
  | `public/peaks-cache.js` | `ui/src/core/peaks-cache.ts` | cả file |
  | `public/waveform.js` | `ui/src/core/waveform.ts` | cả file (`drawWave` vẫn lấy màu từ `getComputedStyle(canvas).color`, nên màu đi theo token) |
  | `public/thumbs.js` | `ui/src/core/thumbs.ts` | cả file |

- **Các bước:**
  1. Mỗi file đích mở đầu bằng comment: `// Port of public/<tên>.js (commit <hash `origin/main` ghi ở task 2.0>); logic unchanged.`, rồi chép nguyên comment mô tả cũ.
  2. Chép thân hàm, chỉ thêm kiểu. Không đổi điều kiện, hằng số hay thứ tự. Kiểu khó viết thì dùng `any` kèm `// loose: ported as is`.
  3. Import giữa các file core dùng đường tương đối có đuôi: `import { cacheGet, cachePut } from "./peaks-cache.ts";`. Không dùng `@/`. Không import React.
  4. Chỉ cú pháp kiểu xoá được: không `enum`, không `namespace`, không tham số `private`/`public` trong constructor, không `import x = require()`.
- **Đạt khi:** `tsc` sạch; Node import được mọi file.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0. Rồi `cd $W && for f in ui/src/core/*.ts; do node -e "import('./$f').then(()=>{},e=>{console.error('$f',e.message);process.exit(1)})" || echo "LỖI $f"; done` không in `LỖI`.

### Task 2.5 — Chuyển test và server sang bản TS

- **Mục tiêu:** test cũ chạy trên bản TS, không đổi một kỳ vọng nào.
- **File:**
  - `tests/gate-cards.test.mjs:3` → `../ui/src/core/gate-cards.ts`;
  - `tests/timeline-edit.test.mjs:3`, `tests/timeline-ripple.test.mjs:8`, `tests/timeline-lanes.test.mjs:6` → `../ui/src/core/timeline-edit.ts`;
  - `tests/ui-extensions.test.mjs:59` → `await import("../ui/src/core/pool-lines.ts")`;
  - `lib/timing-edit.mjs:15` → `../ui/src/core/timeline-edit.ts`.
- **Các bước:** chỉ đổi chuỗi đường dẫn. Không đổi dòng nào khác.
- **Đạt khi:** `git diff --stat` cho mỗi file test chỉ có `1 insertion(+), 1 deletion(-)`.
- **Verify:** `cd $W && node --test tests/gate-cards.test.mjs tests/timeline-edit.test.mjs tests/timeline-ripple.test.mjs tests/timeline-lanes.test.mjs tests/timing-edit.test.mjs tests/ui-extensions.test.mjs 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`. Rồi `git -C $W diff --numstat tests/gate-cards.test.mjs tests/timeline-edit.test.mjs tests/timeline-ripple.test.mjs tests/timeline-lanes.test.mjs tests/ui-extensions.test.mjs lib/timing-edit.mjs` in mỗi dòng bắt đầu bằng `1	1	`.

### Task 2.6 — Test luật cho `ui/src/core`

- **Mục tiêu:** khoá luật "Node chạy được" để phase sau không phá.
- **File:** `tests/ui-core-rules.test.mjs`.
- **Các bước:**
  1. Đọc mọi `ui/src/core/*.ts` (trừ `*.test.ts`).
  2. Báo lỗi khi có `from "@/`, `from "react`, hoặc import tương đối không kết thúc bằng `.ts"`.
  3. `await import()` từng file; lỗi thì báo kèm tên file.
- **Verify:** `node --test $W/tests/ui-core-rules.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"` in `ℹ fail 0` và `pass` ≥ `2`.

### Task 2.7 — `lib/ui-build.mjs` và test

- **Mục tiêu:** biết khi nào phải cài, khi nào phải build, và build được không cần `npx`.
- **File:** `lib/ui-build.mjs`, `tests/ui-build.test.mjs`.
- **Các bước:**
  1. Hằng: `UI_DIR` (`<repo>/ui`), `DIST_INDEX` (`ui/dist/index.html`). Nguồn gồm `ui/src/` (đệ quy, bỏ `*.test.*`), `ui/index.html`, `ui/package.json`, `ui/package-lock.json`, `ui/vite.config.ts`, `ui/tsconfig.json`, `ui/components.json`.
  2. Export:
     - `uiState(dir = UI_DIR)` → `{ hasDeps, needInstall, built, stale, newestSource, builtAt }`;
       - `hasDeps`: có `ui/node_modules/vite/bin/vite.js`;
       - `needInstall`: `!hasDeps`, hoặc `package-lock.json` mới hơn `ui/node_modules/.package-lock.json`;
       - `built`: có `DIST_INDEX`;
       - `stale`: `!built`, hoặc mtime nguồn mới nhất > mtime `DIST_INDEX`.
     - `installUi({ dir, run })`: `npm ci --prefer-offline --no-audit --no-fund` với `cwd: ui`. `run` thay được trong test.
     - `buildUi({ dir, run })`: `process.execPath ui/node_modules/vite/bin/vite.js build` với `cwd: ui`. Không dùng `npx`.
     - `ensureUi({ dir, install, run, log, err })` → `{ ok, action, message }`. `action` là một trong `fresh`, `built`, `installed+built`, `stale-kept`, `failed`. Luật:
       - không stale và không `needInstall` → `fresh`;
       - `needInstall` mà `install` là false → còn `dist` thì `stale-kept`, không thì `failed`;
       - cài hay build lỗi mà còn `dist` → `stale-kept`, in cảnh báo qua `err`;
       - lỗi mà không có `dist` → `failed`, `message` có chữ `npm run setup`.
     - Câu in ra (`log`): `giao diện: đã mới`, `giao diện: cài thư viện…`, `giao diện: build lại (nguồn mới hơn bản build)…`, `giao diện: build xong trong <s> s`, `giao diện: build lỗi, dùng bản build cũ`, `giao diện: chưa có bản build; chạy npm run setup`.
  3. Test dùng thư mục tạm có cấu trúc `ui/` giả (file nguồn, `dist/index.html`, `node_modules/vite/bin/vite.js` rỗng) và `run` giả:
     - `dist` mới hơn nguồn → `fresh`, `run` không được gọi;
     - chạm một file `src/` cho mới hơn → `built`, `run` gọi đúng một lần với `vite.js build`;
     - `run` giả trả lỗi, `dist` còn → `stale-kept`;
     - không `dist`, `run` lỗi → `failed`, `message` có `npm run setup`;
     - không có `node_modules`, `install: false`, còn `dist` → `stale-kept`, `run` không gọi;
     - không có `node_modules`, `install: true` → `run` gọi `npm ci …` trước rồi `vite.js build`.
- **Verify:** `node --test $W/tests/ui-build.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"` in `ℹ fail 0` và `ℹ pass 6`.

### Task 2.8 — Server phục vụ `ui/dist` (chỉ file tĩnh)

- **Mục tiêu:** `/` là UI mới; `/assets/*` phục vụ được; API không đổi.
- **File:** `server.mjs`, `tests/ui-static.test.mjs`, `tests/fixtures/ui-dist/index.html`, `tests/fixtures/ui-dist/assets/app-test.js`, `tests/studio-server.test.mjs`, `tests/no-provider.test.mjs`.
- **Các bước:**
  1. `server.mjs`: thêm `const UI_DIST = join(HERE, "ui", "dist");`. Thêm tham số `ui = UI_DIST` vào `createServer` (`server.mjs:150`).
  2. Thay thân nhánh `p === "/" || p === "/index.html"` (`:303-306`): đọc `join(ui, "index.html")`. Không có file thì `send(res, 503, "Giao diện chưa được build. Chạy npm run setup trong thư mục Motion Studio rồi tải lại trang.")`. Có thì thay token như cũ.
  3. Ngay sau nhánh đó, thêm nhánh bằng `p.startsWith("/assets/")`, **không** dùng `p === …`:
     - tên sau `/assets/` phải khớp `^[A-Za-z0-9._-]+$`, không thì 404;
     - `realpathSync` của file phải nằm trong `realpathSync(join(ui, "assets"))`, không thì 404;
     - có thì `serveFile(req, res, file)`.
  4. Giữ nguyên nhánh `PUBLIC_FILE` ở `:307`. Phase 7 mới bỏ.
  5. Sửa comment đầu `server.mjs`: `GET /` đọc `ui/dist/index.html` (build bằng `npm run setup` hay lúc `start`); `/assets/*` là file build của Vite. Ghi rằng đây không phải route API.
  6. `tests/fixtures/ui-dist/index.html` = `<!doctype html><html lang="vi"><head><meta name="studio-token" content="__STUDIO_TOKEN__"><title>Motion Studio</title></head><body><div id="root"></div><script type="module" src="/assets/app-test.js"></script></body></html>`. `tests/fixtures/ui-dist/assets/app-test.js` = `export const ok = 1;`.
  7. `tests/studio-server.test.mjs` và `tests/no-provider.test.mjs`: thêm `ui: fileURLToPath(new URL("./fixtures/ui-dist", import.meta.url))` vào lời gọi `createServer`. Thêm import `fileURLToPath` nếu file chưa có.
  8. `tests/ui-static.test.mjs`:
     - `/` tiêm token, có `<title>Motion Studio</title>`;
     - `/assets/app-test.js` trả 200, `content-type` có `text/javascript`;
     - `/assets/..%2Findex.html` và `/assets/nope.js` trả 404;
     - `createServer({ ui: <thư mục rỗng> })` thì `/` trả 503, thân có `npm run setup`;
     - `BUILTIN` không đổi so với `main`: so với mảng 34 phần tử chép từ `server.mjs:81-85`.
- **Đạt khi:** test mới xanh; `routes-seam` vẫn xanh.
- **Verify:** `cd $W && node --test tests/ui-static.test.mjs tests/routes-seam.test.mjs tests/studio-server.test.mjs tests/no-provider.test.mjs tests/ui-extensions.test.mjs 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`. Rồi `git -C $W diff main -- routes/ lib/routes.mjs | wc -l` in `0`.

### Task 2.9 — Test cấm tên provider bỏ qua `node_modules` và `ui/dist`, phủ `.ts`/`.tsx`

- **Mục tiêu:** test không đi vào thư mục cài đặt hay build, và vẫn quét mã TS mới.
- **File:** `tests/provider.test.mjs`, hàm `walk` trong test "the default provider's name appears nowhere outside its adapter".
- **Các bước:**
  1. Trong `walk`, bỏ qua mục khi `e === "node_modules"` (mọi cấp) hoặc `rel === "ui/dist"`.
  2. Thêm `".ts"`, `".tsx"` vào tập `text`.
  3. Không đổi danh sách `allowed` hay kỳ vọng `[]`.
- **Verify:** `node --test $W/tests/provider.test.mjs 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`. Thời gian chạy (`ℹ duration_ms`) dưới `20000`.

### Task 2.10 — `bin`: kiểm Node, build lúc `setup` và `start`

- **Mục tiêu:** clone sạch rồi `npm run setup` có UI; `start` tự build khi nguồn mới hơn.
- **File:** `bin/motion-studio.mjs`.
- **Các bước:**
  1. Đầu `main()`, trước mọi lệnh trừ `--help`: nếu `!process.features?.typescript` thì `console.error("studio: cần Node.js 22.18 trở lên (chạy được file .ts); đang chạy " + process.version)` và trả `2`.
  2. Nhánh `setup` (`:154-158`): trước `runSetup(so)`, gọi `const ui = await ensureUi({ install: true })`. `ui.ok` false thì in `ui.message` và trả `1`. Đạt thì `return runSetup(so)` như cũ.
  3. `start(o)` (`:90`): sau khối `if (s) { … }` (server đang chạy) và trước `const owner = portOwner();` (`:101`), nếu `!o.child` thì gọi `const ui = await ensureUi({ install: !uiState().hasDeps })`. `ui.ok` false thì in `ui.message`, trả `1`.
  4. Sửa comment đầu file: thêm một dòng nói `setup` và `start` cài và build `ui/` khi cần (`lib/ui-build.mjs`).
- **Đạt khi:** `status` và `stop` không bị ảnh hưởng (`tests/studio-cli.test.mjs` xanh).
- **Verify:**
  1. `node --test $W/tests/studio-cli.test.mjs 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.
  2. `cd $W && touch ui/src/main.tsx && MOTION_STUDIO_STATE=/tmp/ms-react-cli-state.json node bin/motion-studio.mjs start 2>&1 | head -5`:
     - output có dòng `giao diện: build lại (nguồn mới hơn bản build)…`;
     - output có dòng `giao diện: build xong`;
     - rồi lệnh dừng ở kiểm cổng: `cổng 4317 đang bị … giữ`, thoát 3, nếu Studio của người dùng đang chạy. Nếu 4317 trống thì lệnh sẽ khởi động server ở 4317: **không chạy bước này khi 4317 trống**. Kiểm trước bằng `lsof -nP -iTCP:4317 -sTCP:LISTEN`; trống thì bỏ bước 2 và ghi lý do vào báo cáo phase.
  3. `rm -f /tmp/ms-react-cli-state.json`.

### Task 2.11 — `package.json`, `.gitignore`

- **File:** `package.json`, `.gitignore`.
- **Các bước:**
  1. `package.json` gốc: thêm `"engines": { "node": ">=22.18" }`. Đổi `"test"` thành `"node --test tests/*.test.mjs && npm --prefix ui test"`.
  2. `.gitignore`: thêm dòng `ui/dist/`.
- **Verify:** `git -C $W check-ignore ui/dist/index.html` in `ui/dist/index.html`. Rồi `cd $W && npm test 2>&1 | grep -E "^ℹ fail|Tests .*passed|Test Files"`: phần node in `ℹ fail 0`, phần vitest có dòng `Test Files` và không có chữ `failed`.

### Task 2.12 — Thử trên 4410

- **Mục tiêu:** server của worktree phục vụ trang build. Script `smoke-server.mjs` của phase 1 có thể chưa merge, nên task này dùng một gốc thử tối giản và lệnh `node -e`.
- **Các bước:**
  1. `rm -rf /tmp/ms-react-root-4410-p2 && mkdir -p /tmp/ms-react-root-4410-p2 && cp -R $W/tests/fixtures/manifest /tmp/ms-react-root-4410-p2/demo`
  2. Background-run (ghi PID):

     ```bash
     cd $W && MOTION_STUDIO_STATE=/tmp/ms-react-root-4410-p2/studio.json node -e 'import("./server.mjs").then(({createServer})=>createServer({root:"/tmp/ms-react-root-4410-p2",token:"smoke-4410"}).listen(4410,"127.0.0.1",()=>console.log("ok 4410")))'
     ```

- **Verify:**
  - `curl -s http://127.0.0.1:4410/ | grep -c 'content="smoke-4410"'` in `1`.
  - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4410/assets/$(ls $W/ui/dist/assets | grep '\.js$' | head -1)` in `200`.
  - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4410/api/projects` in `200`.
  - Dừng: `kill <PID>`; `lsof -nP -iTCP:4410 -sTCP:LISTEN | wc -l` in `0`; `rm -rf /tmp/ms-react-root-4410-p2`.

### Task 2.13 — Commit

Commit theo thứ tự, mỗi commit chạy `npm test` và cần `ℹ fail 0`:

1. `build(ui): vite, react, typescript, tailwind and shadcn scaffold with dark tokens`
2. `refactor(ui): port timeline, gate card, marker, waveform and cache logic to typescript`
3. `feat(server): serve the built ui from ui/dist`
4. `build: install and build the ui at setup and when sources are newer at start`

Sau cùng `git -C $W push`.

**Verify:** `git -C $W status --porcelain | wc -l` in `0`. Rồi `git -C $W ls-files ui/dist | wc -l` in `0`. Rồi `git -C $W status -sb | head -1` không có chữ `ahead`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Port TS vô tình đổi logic | Vừa | Cao | Test cũ không sửa kỳ vọng; chỉ đổi dòng import (Verify 2.5 kiểm bằng `numstat`) |
| shadcn CLI cần mạng hoặc hỏi tương tác | Vừa | Thấp | `--yes`; `components.json` viết tay trước |
| Build lúc `start` làm chậm khởi động | Chắc chắn khi nguồn đổi | Thấp | Chỉ khi nguồn mới hơn; đúng một lần sau mỗi `git pull` |
| `lib/timing-edit.mjs` import `.ts` làm server không chạy trên Node cũ | Thấp | Cao | Kiểm `process.features.typescript` ở `bin`; README đổi ở phase 5 |

## Hoàn tác

`git -C $W revert` các commit của phase. `rm -rf $W/ui/dist $W/ui/node_modules`. Server tự quay về `public/` khi nhánh `/` được revert.

## Dừng và hỏi người dùng

Các trường hợp dừng và hỏi người dùng (không gọi kongming): cần đổi API server (bất kỳ thay đổi nào dưới `/api/` hay trong `routes/`); lỗi không giải thích được sau một lượt Failure Protocol; cần xoá hay ghi đè file ngoài repo, trừ `/tmp/ms-react-*`; cần đụng server 4317.

## Failure Protocol

Nếu một điều kiện đạt ở trên trượt, hoặc gặp việc ngoài sở hữu file của phase này: **dừng**, không tự ứng biến, không chạy lại mò. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- file liên quan, ghi `file:line`.

Áp dụng lời khuyên rồi chạy lại đúng bước Verify đó. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.

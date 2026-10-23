# Báo cáo phase 2

## Task 2.0 (baseline)

```
ℹ tests 300
ℹ pass 299
ℹ fail 0
ℹ skipped 1
```

origin/main: 22e7611

## Task 2.1–2.13 (2026-10-23)

Trạng thái: xong. Bốn commit trên `feat/react-ui` (43ab999, f544278, 569df33, f2de212), mỗi commit chạy `npm test` với `ℹ fail 0`.

### Kết quả `npm test` cuối

```
ℹ tests 316
ℹ pass 315
ℹ fail 0
ℹ skipped 1
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Phần `node --test` tăng từ 299 lên 315 bài đạt: `ui-core-rules` 3, `ui-static` 7, `ui-build` 6. Phần vitest có `tokens.test.ts`.

### Verify từng task

- 2.1: build thoát 0; `__STUDIO_TOKEN__` có trong `ui/dist/index.html`; có 1 file JS trong `ui/dist/assets`.
- 2.2: đúng 9 file trong `ui/src/components/ui/`; build chạy; `next-themes` không có trong `ui/package.json`.
- 2.3: `tokens.test.ts` đạt. Thử âm bằng `const x = "#123456";` trong `main.tsx` thì thoát 1, sau đó đã xoá dòng thử.
- 2.4: `tsc --noEmit` sạch; Node import được cả 9 file `ui/src/core/*.ts`. Năm file chép nguyên (`timeline-edit`, `gate-cards`, `peaks-cache`, `waveform`, `thumbs`) được so bằng `module.stripTypeScriptTypes`: bỏ kiểu, comment và khoảng trắng thì mã giống hệt file cũ. Chỉ khác đường import và cặp ngoặc còn lại sau khi bỏ `as`. `markers.ts` cũng giống hệt file cũ sau khi bỏ `drag`, `beatLayer`, `wordDots` cùng hai dòng import của chúng.
- 2.5: `numstat` cho đúng `1 1` ở cả sáu file; sáu test liên quan có `ℹ fail 0` (47 bài đạt).
- 2.6: `pass 3`, `fail 0`. Thử âm bằng một dòng `import x from "react"` thì trượt 1 bài, sau đó đã xoá dòng thử.
- 2.7: `pass 6`, `fail 0`.
- 2.8: `fail 0`; `git diff main -- routes/ lib/routes.mjs` rỗng.
- 2.9: `fail 0`, chạy trong khoảng 116 ms.
- 2.10: `studio-cli` có `fail 0`. Với 4317 đang chạy (pid của người dùng, không đụng tới), `start` in `giao diện: build lại (nguồn mới hơn bản build)…`, `giao diện: build xong trong 0.4 s`, rồi `cổng 4317 đang bị … giữ` và thoát 3.
- 2.11: `git check-ignore` trả `ui/dist/index.html`; `npm test` chạy cả vitest.
- 2.12 (cổng 4410): `/` trả token `smoke-4410`; `/assets/<js>` trả 200; `/api/projects` trả 200. Đã `kill` server; `lsof` của 4410 rỗng; đã xoá gốc thử.

### Lệch so với plan (đã xử lý)

1. **TypeScript 7.0.2** (bản mới nhất) đã bỏ `baseUrl` (lỗi TS5102). Vì vậy `tsconfig.json` không có `baseUrl`, còn `paths` viết `"@/*": ["./src/*"]`. Alias `@/` vẫn chạy cho cả `tsc` lẫn Vite.
2. **Thêm `@types/node`** vào devDependencies (`--save-exact`). `tokens.test.ts` đọc file bằng `node:fs`, nên `tsc --noEmit` cần kiểu của Node. `tsconfig` có thêm `"node"` trong `types`.
3. **shadcn CLI (4.22.1) sinh mã lỗi**, đã sửa tay:
   - CLI ghi `import { cn } from "cn"` và cài gói npm `cn`. Đã đổi thành `@/lib/utils` và gỡ gói `cn`.
   - `dialog.tsx` import `Button` (không nằm trong 9 component). Đã thay bằng `DialogPrimitive.Close` dùng nút HTML gốc, style bằng token, chữ "Đóng".
   - CLI ghi `radix-ui` và `react-resizable-panels` dạng `^`. Đã ghim bản chính xác (1.8.1, 4.14.8).
   - Đã bỏ `next-themes` và đặt `theme="dark"`.
   - Đã đổi `bg-black/50` thành `bg-stage/50` và `bg-white` thành `bg-foreground`.
   - CLI không thêm `tw-animate-css`, nên các lớp `animate-in`/`fade-*` không có tác dụng. Plan không cho thêm dependency nào khác, nên giữ như vậy.
4. **Tên lớp màu:** background, chữ, chữ phụ, đường kẻ và accent dùng tên của shadcn (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`). Token riêng của Studio có lớp `bg-panel`, `bg-panel-2`, `text-warn`, `bg-danger`, `bg-ok`, `bg-stage`, `bg-playhead`, `bg-track-*` và `bg-deco-*`. Không đặt hai tên cho cùng một màu.
5. **`MarkersCtx`** ngoài các trường plan liệt kê còn có `on`, `state.logs`, `state.retimed` và `transport?`. File cũ dùng những trường này trong phần theo dõi job timing và word-sync, và plan đòi giữ nguyên logic. Phase 3 cần nối các trường này từ store và SSE.
6. **`/assets/` có đoạn chứa dấu chấm** (`..%2F`, `../`, `%2e%2e`): server trả **403**, không phải 404 như plan ghi. Lý do là guard có sẵn ở `server.mjs` (đoạn `decodeURIComponent` rồi chặn dot segment, trước `route()`) từ chối trước khi tới nhánh `/assets/`. Phase này không được sửa guard đó. Theo lời khuyên của kongming, test ghim đúng 403 và kiểm rằng thân trả về không có trang. Tên sai hoặc file không có thì vẫn trả 404.
7. Câu log thêm ngoài danh sách của plan: `giao diện: build lần đầu…` (khi chưa có bản build) và `giao diện: thư viện chưa cài hoặc cũ hơn package-lock.json, dùng bản build cũ; chạy npm run setup` (khi cần cài lại mà `install` là false).

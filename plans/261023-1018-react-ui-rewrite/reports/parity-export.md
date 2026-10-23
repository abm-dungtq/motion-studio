# Parity vùng export (nhóm 4e)

Thử ngày 2026-10-23 trên server thử `http://127.0.0.1:4416` (`ui/scripts/smoke-server.mjs`, gốc `/tmp/ms-react-root-4416`, PID 79788, đã dừng). Trình duyệt: Chrome headless qua `playwright-core`. Trạng thái lỗi tạo bằng `page.route` trong trình duyệt. "Thử khả năng" luôn bị chặn ở trình duyệt, không request nào tới server, không tốn quota. Đã bấm thật "Xuất bộ lớp dựng" (một lần huỷ bằng Dừng, một lần chạy xong) và "Xuất video" (exit 5, thiếu cổng). Có một biên nhận thật từ `POST /api/media/check` cho `assets/voice/01.mp3`.

Bản 4411 không chạy lúc thử, nên chữ được đối chiếu với cột "Cũ (4411)" của checklist và với mã cũ.

| ID | Có | Chỗ trong UI mới | Ghi chú |
| --- | --- | --- | --- |
| AGENT-01 | có | thanh trên, chip agent (`shell/AgentChip.tsx`) | "Claude Code 2.1.304 · 5 agent", `data-level=ok`, title "Claude Code sẵn sàng". "· 5 agent" chỉ hiện sau lần quét CLI đầu của server, giống bản cũ |
| AGENT-02 | có | chip agent → hộp thoại "Agent trên máy" | `aria-expanded=true`, đúng 1 lần GET /api/agent khi mở (chip gọi refetch, các dòng không gọi thêm) |
| AGENT-03 | có | hộp thoại agent, `panels/agent/AgentStatus.tsx` | Provider "Plugin … 2.5.0", Claude Code "2.1.304 (Claude Code)", Đăng nhập "có", Runner "mcp: chờ phiên Claude Code đang mở", Job gần nhất "chưa có", ffprobe "có", ffmpeg "có" |
| AGENT-04 | có | hộp thoại agent | mở `/` không có dự án: Job gần nhất "mở một dự án để xem" |
| AGENT-05 | có | chip + hộp thoại agent | chặn /api/agent trả provider null: chip "Chưa có provider", `data-level=bad`; dòng "chưa có", "có, chưa rõ phiên bản", "chưa rõ", "cli: chạy claude -p trên máy", "lỗi (exit 2) · 11:50 23-10", ffprobe/ffmpeg "không tìm thấy"; ghi chú "Chạy npm run setup" và "Mở Terminal và chạy claude để đăng nhập." |
| AGENT-06 | có | hộp thoại agent, `ext/agents/AgentTable.tsx` | cột CLI, Phiên bản, Đăng nhập, Chữ, Đọc ảnh, Sinh ảnh; 5 CLI chạy được + dòng Quota dưới codex-pool, đúng thứ tự |
| AGENT-07 | có | bảng Agent CLI | quota thật "acct1 · hết lượt · acct2 5h 26% · tuần 4% · kế tiếp: acct2"; chặn /api/agents: "Quota: acct1 5h 38% · tuần 12% · acct2 · hết lượt · kế tiếp: acct1" |
| AGENT-08 | có | bảng Agent CLI | "Chỉ dò thấy: Goose 1.45.0, …, Hermes (lỗi), cx-image-generate", "Không thấy: Gemini CLI, Cursor Agent", "Quét lúc …. "Thử khả năng" chạy thật một lần và tốn quota." |
| AGENT-09 | có | bảng Agent CLI | "Chữ: agy → codex-pool → claude → opencode", "Đọc ảnh: …", "Sinh ảnh: codex-pool → codex → agy → gemini" |
| AGENT-10 | có | bảng Agent CLI | nút "Làm mới", "Thử khả năng" (title đúng); chọn agent 5 mục, chọn khả năng Chữ/Đọc ảnh/Sinh ảnh (shadcn Select thay `<select>`) |
| AGENT-11 | có | bảng Agent CLI | POST /api/agents/refresh 200, dòng "Quét lúc" đổi giờ |
| AGENT-12 | có | bảng Agent CLI | probe chặn ở trình duyệt (1 lần), hiện "lỗi thử probe (chặn trước khi tới server)"; vitest kiểm thân `{ id, cap }` và đọc lại /api/agents |
| AGENT-13 | có | bảng Agent CLI | chặn /api/agents có `verified`: ô "có ✓", title "Đã thử: không được" |
| AGENT-14 | có | hộp thoại agent | rộng 640 px ở 1440 (`width: min(640px, calc(100vw - 16px))` qua `registerAgentRows`) |
| AGENT-15 | có | hộp thoại agent | Escape đóng hộp thoại và focus về chip (`data-agent-chip`), cả khi vừa dùng ô chọn trong bảng. Thử lại sau khi merge sửa hợp đồng `61397b3` (server PID 20764, đã dừng) |
| AGENT-16 | có | hộp thoại agent | bấm ra ngoài đóng hộp thoại |
| INSP-18 | có | cột phải, tab Shot, `ext/receipts/ShotReceipts.tsx` | đăng ký `registerInspectorSection({ kinds: ["shot"], order: 60 })`; vitest: shot có file có biên nhận hiện dòng, shot khác hiện "Chưa có biên nhận cho file của shot này." Thử trực tiếp cần timeline (vùng timeline) để chọn shot; phase 5 thử lại |
| TAB-library-01 | có | panel trái, tab Thư viện mẫu | "Video mẫu", "Cảnh mẫu", "Phong cách", "Prompt mẫu"; Video mẫu đang chọn (`aria-pressed`) |
| TAB-library-02 | có | tab Thư viện mẫu | "logo" + Enter → "63 mẫu"; nút Tìm cũng chạy |
| TAB-library-03 | có | tab Thư viện mẫu | "1253 mẫu", "Xem thêm (còn 1229)"; bấm → GET `/api/library?kind=videos&offset=24`, 48 thẻ. `q=` rỗng không gửi (hàm `params` của `queries.ts`), server hiểu như cũ |
| TAB-library-04 | có | tab Thư viện mẫu | chọn thể loại 7 dòng (gồm "Mọi thể loại"), GET có `cat=`; tick "Chỉ mẫu tuyển chọn" → `featured=1`, "200 mẫu" |
| TAB-library-05 | có | tab Thư viện mẫu | thẻ 2: ảnh, "Hoạt hình công thức cocktail Negroni từng bước", "@Ror_Fly · Giải thích và dữ liệu · Tuyển chọn · 1.4k lượt lưu", "Xem prompt", nút Dùng cho dự án / Chép prompt / Xem bản gốc |
| TAB-library-06 | có | tab Thư viện mẫu | 45 mẫu, placeholder đúng; "Biểu đồ tự vẽ", "Dùng khi:", "Gợi ý cho prompt:", 4 ví dụ, nút Dùng cho dự án / Chép gợi ý |
| TAB-library-07 | có | tab Thư viện mẫu | 76 mẫu, placeholder đúng; "Vẽ tay, phác thảo và truyện tranh", "Hợp với:", hai mục mở rộng công thức, 4 ví dụ, Chép công thức |
| TAB-library-08 | có | tab Thư viện mẫu | 31 mẫu, placeholder đúng; "Khung prompt video chuyên nghiệp", "Cấu trúc:", "Chuyển thể:", "Xem khung prompt", 0 ví dụ |
| TAB-library-09 | có | tab Thư viện mẫu | Video mẫu: thẻ đầu "Một khối UI biến hình liên tục theo nhịp nhạc" (server không gửi toolkit cho videos). Prompt mẫu: thẻ "Bộ công cụ đạo diễn" đứng đầu với ba mục mở rộng |
| TAB-library-10 | có | tab Thư viện mẫu | POST /api/director 200, toast "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" |
| TAB-library-11 | có | tab Thư viện mẫu | toast "Đã chép vào bộ nhớ tạm", bộ nhớ tạm 379 ký tự |
| TAB-library-12 | có | tab Thư viện mẫu | "Xem bản gốc" `target=_blank rel="noopener noreferrer"` |
| TAB-library-13 | có | tab Thư viện mẫu | Cảnh mẫu, bấm ví dụ → loại "Video mẫu", ô tìm "2103802280617402509", "1 mẫu" |
| TAB-library-14 | có | tab Thư viện mẫu | dòng nguồn đúng chữ cũ (6 repo, giấy phép, "Prompt và video thuộc về tác giả gốc.") |
| TAB-library-15 | có | tab Thư viện mẫu | `/` không dự án: câu "Chưa mở dự án: …"; Dùng cho dự án tắt, title "Mở một dự án trước" |
| TAB-library-16 | có | tab Thư viện mẫu | `img.lib-thumb` src `/library/thumb/<id>`, `loading=lazy` |
| TAB-output-01 | có | menu Xuất bản → "Cổng & tệp đã xuất…" | abm-intro: "Không có việc nào đang chạy. Bấm Xuất video để render bản giao." và "Chưa có bản xuất. Bấm Xuất video ở trên; file MP4 hiện ở đây khi xong." |
| EXP-01 | có | menu Xuất bản (vỏ) | POST /api/export, toast "Thiếu cổng: animatic … older than PLAN.md …" (exit 5); job "Xuất video · render", exit 5 với lời nhắn trong hộp thoại |
| EXP-02 | có | menu Xuất bản (vỏ) + hộp thoại | title "MP4 từng shot, …"; POST /api/bundle, toast "Đang xuất bộ lớp dựng: render rồi cắt từng shot"; Dừng → POST /api/jobs/cancel, thẻ thành "đã huỷ", không toast |
| EXP-03 | có | hộp thoại Xuất bản, `panels/export/GateFails.tsx` | "Cần duyệt lại animatic" + từng dòng FAIL; vitest kiểm cả "Chưa đủ cổng xuất" |
| EXP-04 | có | hộp thoại Xuất bản, `panels/export/Jobs.tsx` | thẻ job mới nhất trước, tối đa 4: "Xuất video · bộ lớp dựng" / "đang chạy" / "exit 0" / "đã huỷ", lời nhắn của job |
| EXP-05 | có | hộp thoại Xuất bản | "Log" trong `<details>` mở khi job chạy; số dòng log tăng 9 → 27 → 39 → 46 → 58 trong 5 s qua SSE |
| EXP-06 | có | hộp thoại Xuất bản, `panels/export/Exported.tsx` | sau khi bộ lớp dựng xong: một dòng "thuy-mau-demo-…-bundle/" 40.2 MB, link manifest.json `target=_blank rel=noopener`, title "manifest.json của bộ lớp dựng"; danh sách tự tải lại khi job kết thúc |
| EXP-07 | có | hộp thoại Xuất bản, `ext/receipts/ReceiptList.tsx` | mục "Biên nhận" + "Làm mới" (1 GET); dòng "đạt · media-check · human · 12:59 23-10 · assets/voice/01.mp3" |
| EXP-08 | có | hộp thoại Xuất bản | bấm dòng → `aria-expanded=true`, từng kiểm có "✓", id, file, chi tiết, rồi "JSON đầy đủ" |
| API-01 | có | `useAgent` (api/queries.ts) | GET /api/agent khi bấm chip |
| API-02 | có | `agentsQuery` | GET /api/agents, bảng như AGENT-06 |
| API-03 | có | `agentsProbe` | chỉ thử bằng chặn trong trình duyệt và vitest, như cũ |
| API-04 | có | `agentsRefresh` | POST /api/agents/refresh 200 |
| API-18 | có | `actions.exportBundle` | như EXP-02 |
| API-24 | có | `actions.exportVideo` | như EXP-01 |
| API-36 | có | `actions.cancelJob` | nút Dừng; vitest kiểm `cancelJob("j2")` |
| API-43 | có | `useLibrary` | như TAB-library-03 |
| API-52 | có | `useReceipt` | như EXP-08 |
| API-53 | có | `useReceipts` | như EXP-07 |
| STATE-03 | có | chip + hộp thoại agent | chặn /api/agent 500: "Không đọc được trạng thái: lỗi thử agent"; chip title "Không đọc được trạng thái agent: lỗi thử agent" |
| STATE-04 | có | hộp thoại agent | "Không tìm thấy opus-video" + "Chạy npm run setup" (provider_error) |
| STATE-05 | có | hộp thoại agent (vỏ) | `ErrorBoundary` của AgentDialog: "Mục mở rộng lỗi: …" (test `shell/AgentDialog.test.tsx`) |
| STATE-15 | có | bảng Agent CLI | "Lần thử gần nhất (codex · Sinh ảnh): không được, không sinh được ảnh" (chặn /api/agents và vitest) |
| STATE-16 | có | bảng Agent CLI | chặn /api/agents 500: "Không đọc được danh sách agent: lỗi thử danh sách agent". Khác bản cũ có chủ đích: bản cũ ném "Cannot read properties of null (reading 'agents')" vì gọi `controls()` khi chưa có scan; dặn chung số 6 bảo không gọi controls khi chưa có scan, nên giờ hiện lỗi thật và không có nút |
| STATE-17 | có | bảng Agent CLI | như AGENT-12 |
| STATE-18 | có | hộp thoại Xuất bản | chặn /api/receipt 500: "Không đọc được biên nhận: lỗi thử biên nhận" |
| STATE-19 | có | hộp thoại Xuất bản | "Chưa có biên nhận. Mỗi lần sinh ảnh, kiểm media hay xuất file sẽ ghi một biên nhận ở đây." |
| STATE-20 | có | hộp thoại Xuất bản | chặn /api/receipts 500: "lỗi thử danh sách biên nhận" |
| STATE-39 | có | tab Thư viện mẫu | "Không thấy video mẫu nào khớp "zzzqqxx". Thử từ khoá ngắn hơn, bỏ dấu, hoặc đổi loại mẫu." kèm dòng nguồn |
| STATE-40 | có | hộp thoại Xuất bản | "Chưa có bản xuất. Bấm Xuất video ở trên; file MP4 hiện ở đây khi xong." |
| STATE-41 | có | hộp thoại Xuất bản | "Không có việc nào đang chạy. Bấm Xuất video để render bản giao." |
| EXT-04 | có | hộp thoại agent (vỏ) | một dòng ném lỗi chỉ hỏng dòng đó (test `shell/AgentDialog.test.tsx`); dòng của vùng này chạy trong cùng ErrorBoundary |

Ảnh chụp: `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/export/{1440,2560}/{export,library,agent}.png` (`shoot.mjs` in `ok 6`).

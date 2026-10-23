# Parity nhóm 3: vỏ ứng dụng và hợp đồng chung

Thử trên 4410 (`/tmp/ms-react-root-4410`) ngày 2026-10-23, bản build `ui/dist` của nhánh `feat/react-ui`.

- **Ảnh:** `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/shell/{1440,2560}/shell.png`, cùng `agent-dialog.png`, `banner-readonly.png`, `banner-import.png`, `new-project.png`.
- **Đối chiếu mockup (ảnh 1440):** khớp bố cục. Thanh trên đủ phần tử. Rail 52 px còn trống, vì phase này chưa có tab. Sân khấu có khung 16:9 viền tối, transport nằm dưới. Cột phải có hai tab Đạo diễn và Shot. Hàng timeline ở đáy hiện gợi ý phím.
- **Số route:** lệnh đếm trên `public/*.js` ra `66`, khớp với 66 dòng `API` của checklist. Lệnh tìm route thiếu không in gì. `/api/extensions` được bỏ qua có chủ ý: bộ nạp tìm extension lúc build.
- **Thử tay:**
  - chọn dự án;
  - hoàn tác và làm lại bằng nút, bằng Cmd+Z và bằng Cmd+Shift+Z: v4 → v5 → v6, rồi tới v8;
  - mở hộp thoại agent;
  - menu Xuất bản có đủ ba mục;
  - `abm-intro` hiện dải chỉ xem; `viet-pro-intro` hiện dải nhập, nhập xong thành chỉ xem;
  - tạo `ms-react-shell-test` ở chế độ `video-co-san`: mở tab `media`, toast "Đã tạo dự án ms-react-shell-test", tạo trùng thì báo lỗi ngay trong hộp thoại;
  - không có lỗi trang nào.

| ID | Có | Ghi chú |
|---|---|---|
| SHELL-01 | có | Chữ "Motion Studio" ở `TopBar`; tiêu đề trang và favicon nằm ở `ui/index.html` |
| SHELL-02 | có | `ProjectSelect`: dòng đầu "— chọn dự án —", hậu tố " (chỉ xem)" và " (chưa nhập)"; đã thử trên 4410 |
| SHELL-03 | có | `data-testid="project-title"` hiện `m.title` |
| SHELL-04 | có | `VersionSelect`: "v<n> · hiện tại" hoặc "v<n> · <actor>"; chọn bản khác thì toast và quay về bản hiện tại (có test) |
| SHELL-05 | có | `GateChip`: chữ "Cần duyệt lại animatic" hoặc "Chưa đủ cổng xuất"; tooltip liệt kê dòng FAIL; có `data-to` |
| SHELL-06 | có | Cổng animatic mở tab Đạo diễn và mở lại cột phải; cổng khác mở `ExportDialog` |
| SHELL-07 | có | Nút `Undo2` có tooltip "Hoàn tác (Ctrl/Cmd+Z)"; trên 4410 ra toast "Đã hoàn tác (v5)" |
| SHELL-08 | có | `Redo2` luôn bật khi dự án sửa được; hết bản thì server trả 422 và toast "Không còn gì để làm lại" (`actions.redo`) |
| SHELL-09 | có | Chuyển thành mục "Xuất video" trong menu Xuất bản; gọi `actions.exportVideo`, toast "Đang xuất video: render bản giao rồi nén" |
| SHELL-10 | có | `Banner` (provider): lỗi in đậm, rồi "Chạy `<setup>` trong thư mục Motion Studio, rồi tải lại trang." (có test) |
| SHELL-11 | có | Dải "Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn"; Hoàn tác và Làm lại tắt; đã thử với `abm-intro` |
| SHELL-12 | có | Dải "Dự án chưa có project.json." kèm nút "Nhập dự án"; đã thử với `viet-pro-intro` |
| SHELL-13 | có | `actions.importProject`: POST `/api/import`, toast "Đã nhập dự án"; xong thì thành chỉ xem, ô chọn hiện "viet-pro-intro (chỉ xem)" |
| SHELL-14 | có | Chưa mở dự án thì `Stage` hiện "Chọn một dự án"; có bản render thì hiện ảnh poster |
| SHELL-15 | có | Nút phát tròn, đồng hồ `0:00.0 / 0:20.0` ghi qua ref, iframe player trong khung đúng tỉ lệ |
| SHELL-16 | có | `data-transport="toggle"` gọi `transport.toggle()`; aria-label là "Phát" hoặc "Dừng" |
| SHELL-17 | có | Gợi ý phím nằm trên thanh 36 px của `TimelineArea` (`TIMELINE_HINT`); khi thay file, 4a giữ chữ này |
| SHELL-18 | có | `actions.patch` gặp 409 thì toast "Đã có thay đổi mới, đã tải lại" và tải lại manifest |
| SHELL-19 | có | `actions.patch`, lỗi khác: toast lỗi bằng `r.error` |
| SHELL-20 | có | `actions.patch` trên dự án chỉ xem: toast lỗi "Dự án chỉ xem, sửa qua đạo diễn" |
| SHELL-21 | có | `announceRequests`: đổi sang `failed` thì toast "Yêu cầu không xong: …"; đổi sang `done` cũng có toast |
| SHELL-22 | có | `useProjectEvents`: SSE `manifest` làm mới project và log; trên 4410, phiên bản đổi theo sau mỗi lần hoàn tác |
| SHELL-23 | có | `applyJobEvent`: toast khi job xuất xong, lỗi, hoặc code 5 ("Thiếu cổng") |
| NEW-01 | có | `NewProjectDialog`: focus vào ô tên; mặc định chế độ `tu-dau`, tỉ lệ 16:9, 30 giây |
| NEW-02 | có | `pattern` `[a-z0-9][a-z0-9\-]{1,48}`, `required`, ghi chú "chữ thường, số, gạch nối (2–49 ký tự)" |
| NEW-03 | có | Bốn chế độ lấy từ `MODES` (`core/new-project.ts`) |
| NEW-04 | có | Placeholder của "Việc đầu tiên" lấy theo `hintOf(mode)`; đã thử với `video-co-san` |
| NEW-05 | có | Ba tỉ lệ lấy từ `ASPECTS` |
| NEW-06 | có | Chủ đề: `required`, `maxLength` 500 |
| NEW-07 | có | Thời lượng: `min` 5, `max` 600, `step` 1 |
| NEW-08 | có | Khán giả: tuỳ chọn, tối đa 500 |
| NEW-09 | có | Việc đầu tiên: tuỳ chọn, tối đa 4000 |
| NEW-10 | có | `reportValidity()` chặn trước khi gửi; tên "Bad Name" giữ hộp thoại mở |
| NEW-11 | có | Tạo trùng thì báo "Đã có thư mục ms-react-shell-test trong workspace" trong hộp thoại (409) |
| NEW-12 | có | Không có trả lời (status 0): hiện chữ của `send()`, "không kết nối được Studio (…)" |
| NEW-13 | có | Lúc đang tạo: nút khoá, chữ "Đang tạo…"; Escape, bấm ra ngoài và nút đóng đều không đóng hộp thoại |
| NEW-14 | có | "Huỷ" đóng hộp thoại; mở lại thì form trống và không còn lỗi (reset khi mở) |
| NEW-15 | có | Body tạo bằng `bodyOf`: đã trim, chỉ gửi trường tuỳ chọn khi có chữ |
| NEW-16 | có | `actions.projectCreated`: nạp lại danh sách, mở dự án, toast "Đã tạo dự án <tên>" |
| NEW-17 | có | Chế độ `video-co-san` mở tab `media`; trên 4410 URL có `tab=media` |
| NEW-18 | có | Nhãn giữ như cũ: "Tên thư mục", "Chế độ", "Tỷ lệ", "Chủ đề", "Thời lượng (giây)", "Khán giả (tuỳ chọn)", "Việc đầu tiên giao cho AI (tuỳ chọn)", "Huỷ", "Tạo dự án" |
| RAIL-01 | có | Tab `ai` thành tab Đạo diễn của cột phải; `?tab=ai` mở tab này (có test); 4d lấp nội dung |
| RAIL-02 | có | Rail và registry sẵn sàng cho `media` (nhóm assets, order 10); 4b đăng ký nút, tiêu đề, lead |
| RAIL-03 | có | Rail sẵn sàng cho `voice` (nhóm audio, order 10); 4c đăng ký |
| RAIL-04 | có | Rail sẵn sàng cho `music` (nhóm audio, order 20); 4c đăng ký |
| RAIL-05 | có | Rail sẵn sàng cho `library` (nhóm library, order 10); 4e đăng ký |
| RAIL-06 | có | Tab `output` thành `ExportDialog` (tiêu đề "Xuất bản", lead cũ); `?tab=output` mở hộp thoại này (có test) |
| RAIL-07 | có | Rail sẵn sàng cho `anime` (nhóm assets, order 30); 4f đăng ký |
| RAIL-08 | có | Rail sẵn sàng cho `styles-code` (nhóm assets, order 20); 4g đăng ký |
| RAIL-09 | có | `?tab=` đọc qua `requestedTab()`; extension nạp xong thì `restoreTab()` chọn tab, id lạ thì về tab đầu |
| RAIL-10 | có | `setLeftTab` ghi localStorage `studio.tab` và `?tab=` (có test) |
| RAIL-11 | có | `badge()` > 0 hiện số đếm (có test) |
| RAIL-12 | có | Chấm `bg-warn` trên tab Đạo diễn, `aria-label="Có thẻ đang chờ bạn"` khi có `waiting_user` (có test) |
| RAIL-13 | có | Cơ chế badge có sẵn; 4c trả số câu cũ qua `badge` của tab `voice` |
| RAIL-14 | có | Alt+1…9 dùng `e.code`; bỏ qua khi có Meta, Ctrl hay Shift, khi đang gõ, hoặc khi hộp thoại mở (có test) |
| RAIL-15 | có | Mũi tên, Home và End đi vòng trên rail; roving tabindex (có test) |
| RAIL-16 | có | Icon Lucide 20 px; nhãn chuyển vào tooltip "<nhãn> (Alt+n)" và aria-label |
| KEY-18 | có | Cmd+Z: thử trên 4410 ra toast "Đã hoàn tác"; nằm trong khung `TimelineArea` cho tới khi 4a thay |
| KEY-19 | có | Cmd+Shift+Z: thử trên 4410 ra toast "Đã làm lại" |
| KEY-20 | có | Ctrl+Y làm lại, theo `keyAction` |
| KEY-24 | có | Phím không chạy khi có `[role="dialog"]`, khi focus ở `[role="tablist"]`, hoặc khi đang gõ |
| KEY-29 | có | Alt+1…9 trên rail (có test); không chạy khi đang gõ |
| KEY-30 | có | Escape đóng "Dự án mới" (thử trên 4410), trừ lúc đang tạo |
| API-23 | có | `useProjectEvents` (`api/events.ts`) với `EventSource` `/api/events?name=` |
| API-25 | có | Bỏ có chủ ý: `ext/load.ts` tìm `panels/*` và `ext/*` lúc build; route `/api/extensions` vẫn còn ở server |
| API-33 | có | `useGates` và `actions.refreshGates`; làm lại sau 1,5 s khi manifest đổi, sau 0,5 s khi có `retimed` |
| API-34 | có | Hàm ghi `importManifest`, gọi từ `actions.importProject` |
| API-35 | có | `useJobs`, `jobsCancel` |
| API-44 | có | `useLog`, dùng trong `VersionSelect` |
| API-48 | có | Hàm ghi `patch`, gọi từ `actions.patch` |
| API-49 | có | `useProject`, chỉ chạy khi có `has_manifest` |
| API-50 | có | `useProjects`, `ProjectSelect` |
| API-51 | có | Hàm ghi `projectsNew`, gọi từ `NewProjectDialog` |
| API-54 | có | Hàm ghi `redo` |
| API-58 | có | `statusQuery`; kết quả lúc khởi động ghi vào `providerStatus` |
| API-66 | có | Hàm ghi `undo` |
| STATE-26 | có | Lỗi của server và 3 dòng stderr cuối hiện trong hộp thoại (`failureText`) |
| STATE-30 | có | `Fail`: "Không tải được: <message>. Thử bấm lại mục này trên thanh trái." |
| STATE-31 | có | `Empty({ text, action, to })`: `to` đi tới "ai" (Đạo diễn), "output" (hộp thoại xuất) hoặc tab trái |
| STATE-32 | có | `NeedManifest` khi chưa mở dự án: chữ cũ, nút "Chọn dự án" đưa focus vào `#project-select` |
| STATE-33 | có | `NeedManifest` khi chưa có project.json: chữ cũ |
| EXT-01 | có | `registerTab`, có `badge` (được dùng hook) |
| EXT-02 | có | `registerSection(hostId)`; `SectionHost` bọc mỗi phần trong `ErrorBoundary` |
| EXT-06 | có | Thay bằng component icon Lucide, truyền vào `registerTab({ icon })` |
| EXT-07 | có | `studio.toast` là `say(msg, err)`: lỗi giữ 6 s, còn lại 3 s |
| EXT-08 | có | `createStudio()` trả `actions`, `api`, `send`, `useStudio`, `bus`; `h` có ở `core/dom.ts` |
| EXT-09 | có | Extension lỗi bị bỏ qua, báo một toast "Extension lỗi, đã bỏ qua: <thư mục>: …" (có test) |
| EXT-10 | có | Không còn danh sách lấy lúc chạy. Lỗi nạp báo qua toast của `loadAll`; lỗi lúc khởi động báo qua `actions.loadExtensions` |
| EXT-11 | có | CSS riêng thay bằng Tailwind và token; luật token có test (`src/styles`) |
| EXT-12 | có | Mỗi tab và mỗi phần có `ErrorBoundary` với chữ của `fail()`; phần khác vẫn chạy (có test với hàng agent hỏng) |

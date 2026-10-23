# Parity vùng director (nhóm 4d)

Thử ngày 2026-10-23 trên UI React, cổng 4415 (`ui/scripts/smoke-server.mjs`, PID 89747, đã dừng), gốc thử `/tmp/ms-react-root-4415`. Thao tác chạy bằng Playwright với Chrome cài sẵn. Để chọn khối beat, word, line, music và event khi timeline React chưa có trên nhánh này, script thử nối thêm `window.__ms = { useStudio, actions, bus, markers, registerInspectorSection }` vào bundle không nén, chỉ trong trình duyệt của lần thử; mã nguồn không đổi. Thẻ cổng được seed bằng `ui/scripts/seed-gate-cards.mjs`. Các trạng thái chat của perf-60 được seed bằng một script tạm trong `/tmp` gọi `requests.enqueue/next/finish/ask/expireWaiting` của provider. Không chạy `claude -p` (runner `mcp`). File `bgm.mp3.beats.json` được chép từ gốc 4411 sang gốc 4415 để có lưới phách.

Chỗ trong UI mới: "Đạo diễn" là `ui/src/panels/director` (khe `right.director`), "Shot" là `ui/src/panels/inspector` (khe `right.shot`).

| ID | Mới | Chỗ trong UI mới | Ghi chú |
| --- | --- | --- | --- |
| DIR-01 | có | Đạo diễn, `Storyboard.tsx` | `<details>` "Storyboard", nội dung `# Storyboard: thuy-mau-demo (16:9)`; thiếu file thì "Chưa có STORYBOARD.md" (test) |
| DIR-02 | có | Đạo diễn, `threads.ts` + `Turn.tsx` | perf-60: request `follows` nằm trong luồng của request trước, không có bong bóng người dùng riêng (14 bong bóng, 7 của người dùng, theo dữ liệu seed) |
| DIR-03 | có | Đạo diễn, `Turn.tsx` | `cả dự án · v4 · 12:59 23-10`, `shot s2 · v4 · 12:59 23-10` |
| DIR-04 | có | Đạo diễn, `Turn.tsx` | `Đang làm…` + Huỷ yêu cầu, `Đang chờ tới lượt.` + Huỷ yêu cầu |
| DIR-05 | có | Đạo diễn | Sau Trả lời lại: thêm một `Đang chờ tới lượt.` |
| DIR-06 | có | Đạo diễn, `GateCard.tsx` | "Đạo diễn cần bạn trả lời" / "Chọn hướng?", lựa chọn Tối giản, Rực rỡ, Cổ điển, mỗi nút một ảnh (`data-pics`) |
| DIR-07 | có | Đạo diễn, `Turn.tsx` | Hai bong bóng "Đạo diễn hỏi" kèm câu hỏi chọn hướng và duyệt animatic, rồi lựa chọn của người dùng bên phải |
| DIR-08 | có | Đạo diễn, `Turn.tsx` | Biên nhận đầy đủ, "Đã làm xong việc thử: đổi chữ shot 2." |
| DIR-09 | có | Đạo diễn, `Turn.tsx` | Thẻ hết hạn "Muốn chữ gì ở shot cuối?" / "Hết hạn chờ trả lời. Trả lời lại để đạo diễn làm tiếp." |
| DIR-10 | có | Đạo diễn, `Turn.tsx` | "Lỗi thử: không tìm thấy file\nchi tiết dòng 2", viền đỏ |
| DIR-11 | có | Đạo diễn, `Turn.tsx` | POST `/api/director/cancel` `{name, id}`, toast "Yêu cầu không xong: Đã huỷ trong Studio", bong bóng "Đã huỷ trong Studio" |
| DIR-12 | có | Đạo diễn, `Working.tsx` | "Đạo diễn đang làm…" (request running, không có job đạo diễn nên không có log); log 3 dòng cuối và "Đang khởi động…" kiểm trong test |
| DIR-13 | có | Đạo diễn, `Composer.tsx` | Placeholder và nhãn "⌘/Ctrl+Enter để gửi" đúng; nháp "shot 3 chậm lại" giữ khi đổi tab; trống thì báo lỗi "Viết yêu cầu cho đạo diễn trước"; gửi xong ô rỗng |
| DIR-14 | có | Đạo diễn, `Composer.tsx` | Cmd+Enter → POST `/api/director` `{scope:"project", text:"shot 3 chậm lại"}` |
| DIR-15 | có | Shot (Nhờ đạo diễn) → `actions.direct` | Ô trống → báo lỗi "Viết yêu cầu cho đạo diễn trước" |
| DIR-16 | có | toast chung | "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" |
| DIR-17 | có | Đạo diễn, `DirectorChat.tsx` | Mở tab và sau khi gửi đều cuộn tới cuối (2434/2434, 2762/2762); thẻ đang sống thì giữ chỗ |
| DIR-18 | có | Đạo diễn, `NeedManifest` | "Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng để bắt đầu." + nút Chọn dự án |
| DIR-19 | có | Đạo diễn, `Composer.tsx` | abm-intro (chỉ xem): ô giao việc bật |
| GATE-01 | có | Đạo diễn, `GateCard.tsx` | Như DIR-06 |
| GATE-02 | có | Đạo diễn, `GateCard.tsx` | Chặn answer trả 500: lỗi hiện trong thẻ (`role=alert`), các nút mở khoá lại |
| GATE-03 | có | Đạo diễn, `GateCard.tsx` | Bấm Rực rỡ → POST `{value:"2"}`, toast "Đạo diễn xong: Người dùng đã trả lời: Rực rỡ (2)"; chat sau đó: "Đạo diễn hỏi / Chọn hướng?", "Rực rỡ (2)", "Đang chờ tới lượt." |
| GATE-04 | có | Đạo diễn, `GateCard.tsx` | video `/p/thuy-mau-demo/demo/animatic.mp4` controls, link "animatic.mp4", nút ["Chưa được","Duyệt"] |
| GATE-05 | có | Đạo diễn, `GateCard.tsx` | POST `{value:"approve"}`, toast "Đạo diễn xong: Người dùng đã trả lời: Duyệt"; DEMO.md: `approval: user@studio 2026-10-23T06:01:11.405Z duyệt animatic demo/animatic.mp4` |
| GATE-06 | có | Đạo diễn, `GateCard.tsx` | "Chưa được" mở ô "Ghi chú: chưa được ở đâu" (placeholder đúng); Gửi ghi chú → POST `{value:{reject:"chữ shot 2 nhỏ quá"}}`, toast "…Không duyệt: chữ shot 2 nhỏ quá" |
| GATE-07 | có | Đạo diễn, `GateCard.tsx` | Thẻ "Trả lời lại câu hỏi đã hết hạn", ô "Viết câu trả lời…"; Gửi khi trống → lỗi "Viết câu trả lời trước" |
| GATE-08 | có | Đạo diễn, `GateCard.tsx` | 500 → "Chưa gửi được câu trả lời: lỗi thử trả lời (chi tiết cuối). Bấm lại để thử."; abort → "Không gửi được tới Studio (mất kết nối). …"; 403 → "Studio đã khởi động lại nên trang này hết phiên. …"; quá giờ kiểm bằng test (`answerFailure({timeout:true})`, `ANSWER_TIMEOUT_MS` 90 s) |
| GATE-09 | có | Đạo diễn, `memo.ts` | Nháp lý do "chữ shot 2 nhỏ quá" giữ qua đổi tab và gắn lại component (live và test) |
| GATE-10 | có | Đạo diễn, `GateCard.tsx` | POST `/api/director` `{scope:"project", text:"Trả lời lại câu hỏi \"Muốn chữ gì ở shot cuối?\": Chữ: Cảm ơn đã xem"}`, toast "Đã gửi câu trả lời, đạo diễn làm tiếp" |
| INSP-01 | có | Shot, `ShotView.tsx` | "SHOT 2 · 6.5s–12.5s" |
| INSP-02 | có | Shot, `ShotView.tsx` | Nhãn Tên, Số giây, Chuyển cảnh vào; danh sách đầu "(không)". Số lựa chọn theo `/api/directions` của provider đang cài: 37 seam + "(không)" = 38 (bản cũ ghi 97 trên 4411, cùng công thức `["", ...new Set([...seams, cur])]`) |
| INSP-03 | có | Shot, `core/inspector-ops.ts` | Không đổi → "Không có gì thay đổi"; 0,3 → lỗi "Số giây tối thiểu là 0,5"; đổi tên, chuyển cảnh, ghi chú → một POST `/api/patch` với 3 op `set_shot`, toast "Đã áp dụng" |
| INSP-04 | có | Shot, `ShotView.tsx` | Trống → lỗi; "cho chữ to hơn" → POST `{scope:"shot", target:"s2", t:0, text:"cho chữ to hơn"}`, toast studio_request_next |
| INSP-05 | có | Shot, `ShotView.tsx` | "Chất liệu (0)" + "Chưa có chất liệu" |
| INSP-06 | có | Shot, `ShotView.tsx` | abm-intro: Tên tắt, Áp dụng tắt, ô chuyển động bật |
| INSP-07 | có | Shot, `LineView.tsx` | "CÂU vo-03 · 12.8s–16.4s", trích lời, nút "Sửa lời ở tab Lời & giọng" mở tab voice; nhắc "Lời đã sửa…" khi `gate: stale` (test; câu ở gốc 4415 không stale) |
| INSP-08 | có | Shot, `MusicView.tsx` | "NHẠC · bgm.mp3", sáu nhãn đúng, ghi chú "assets/bgm/bgm.mp3" / "Fade chỉ nghe trong bản xuất, xem thử chưa có fade" |
| INSP-09 | có | Shot, `core/inspector-ops.ts` | Đủ năm lỗi đúng chữ; fade vào 1,5 + âm lượng 60 → một `update_music` chỉ gồm trường đổi, toast "Đã áp dụng" (bản thử có thêm `end:null` vì script đã xoá ô Kết thúc; `musicOps` giữ đúng luật cũ, test riêng) |
| INSP-10 | có | Shot, `EventView.tsx` | "SFX sfx-whoosh · 0:06.3", bốn ô đúng giá trị và khoá, nút ["Áp dụng","Nhờ đạo diễn xoá SFX này"], ghi chú âm lượng |
| INSP-11 | có | Shot, `core/inspector-ops.ts` | 99 → lỗi "Thời điểm trong 0–20.0s"; 6,5 → POST `[{op:"move_event", id:"sfx-whoosh", start:6.5}]`, "Đã áp dụng" |
| INSP-12 | có | Shot, `EventView.tsx` | POST `/api/director` `{scope:"shot", target:"s2", t:6.5, text:"Xoá SFX sfx-whoosh"}`, toast studio_request_next |
| INSP-13 | có | Shot, `EventView.tsx` | SFX Studio (sfx-1): nút ["Áp dụng","Xoá SFX"]; Xoá SFX → `remove_event` |
| INSP-14 | có | Shot, `BeatView.tsx` | "MỐC PHÁCH · bgm.mp3.beats.json", "… · 126.8 BPM · một phách 0.473s", "Phách đầu (beat0, giây)", "Giờ gốc 0.004s", Áp dụng, Về gốc, Hoàn tác mốc, câu hướng dẫn |
| INSP-15 | có | Shot, `WordView.tsx` | "MỐC TỪ · "Lớp"", "vo-01 · từ #1/12 · assets/voice/01.mp3.words.json", Trên video, hai ô, Giờ gốc, Áp dụng, Về gốc, Hoàn tác mốc, Kiểm khớp lời, câu hướng dẫn |
| INSP-16 | có | Shot, `RetimedNote.tsx` | Dời một từ, job TIMING chạy xong: "Mốc đã đổi, TIMING đã dựng lại: animatic cần duyệt lại trước khi xuất" ở đầu view |
| INSP-24 | có | store `setPick` → khe timeline | Chọn sfx-whoosh thì `sel` = s1 (shot chứa nó). Lớp `.sel` trên khối shot do timeline vẽ từ `sel` |
| INSP-25 | có | Shot, `ShotView.tsx` | `pick("shot","s2")` rồi bus `focus-note` (như menu timeline cũ) → focus ô `data-role="motion-note"` |
| API-19 | có | `useDirections()` | GET `/api/directions` khi mở inspector shot |
| API-20 | có | `actions.direct` | Như DIR-14 |
| API-21 | có | `actions.answer` | Như GATE-03 |
| API-22 | có | `actions.cancelRequest` | Như DIR-11 |
| API-55 | có | `useRequests` | Như DIR-02 |
| STATE-29 | có | Shot, `shell/InspectorHost.tsx` | "Mục mở rộng lỗi: mục thử ném lỗi" (sau sửa hợp đồng `a8a4ed4`) |
| STATE-34 | có | Đạo diễn | abm-intro: "Chưa giao việc nào. Viết việc đầu tiên ở ô dưới rồi bấm Giao việc." |
| EXT-03 | có | `registerInspectorSection` | Mục thử ném lỗi: "Mục mở rộng lỗi: mục thử ném lỗi", các mục khác vẫn chạy |

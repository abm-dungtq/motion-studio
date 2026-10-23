# Parity vùng voice-music (nhóm 4c)

Thử ngày 2026-10-23 trên `http://127.0.0.1:4414` (server `ui/scripts/smoke-server.mjs`, PID 41663, đã dừng; gốc thử `/tmp/ms-react-root-4414`, runner `mcp` nên `/api/director` chỉ xếp hàng, không chạy `claude -p` hay ElevenLabs). Trình duyệt Chrome qua playwright-core; script thử nằm ngoài repo (`/tmp/ms-react-vm-check/parity.mjs`, `music02.mjs`). Ảnh: `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/voice-music/{1440,2560}/{voice,music}.png`.

| ID | Có | Chỗ trong UI mới | Ghi chú |
| --- | --- | --- | --- |
| TAB-voice-01 | có | panel trái, tab Lời & giọng (`ui/src/panels/voice/VoiceTab.tsx`) | `["1. vo-01 [unknown] aria \"Câu 1\"","2. vo-02 [unknown] aria \"Câu 2\"","3. vo-03 [unknown] aria \"Câu 3\""]`, lead đúng chữ `panels.js:16` |
| TAB-voice-02 | có | panel trái, tab Lời & giọng, nút "Lưu lời" | toast "Không có gì thay đổi", 0 POST |
| TAB-voice-03 | có | panel trái, tab Lời & giọng, nút "Lưu lời" | POST /api/patch `{"base":4,"ops":[{"op":"set_line_text","id":"vo-03","text":"Kéo dài một cảnh, nét vẽ tự giãn theo nhịp."}]}`, toast "Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại", phiên bản v4 → v5 |
| TAB-voice-04 | có | thẻ câu 3 | badge "stale" (màu `warn`), dòng nhắc, nút "Nhờ duyệt và lồng tiếng lại"; badge rail "Lời & giọng, 1 việc chờ bạn" |
| TAB-voice-05 | có | thẻ câu 3, nút "Nhờ duyệt và lồng tiếng lại" | POST /api/director `{"scope":"line","target":"vo-03","text":"Câu vo-03 đã sửa lời: chạy cổng viet-pro cho câu này rồi lồng tiếng lại riêng câu đó."}`, toast "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" |
| TAB-voice-06 | có | `?name=abm-intro&tab=voice` | 5 ô câu tắt, 5 nút "Lưu lời" tắt |
| TAB-voice-07 | có | panel trái, tab Lời & giọng | gõ "đang gõ dở" ở câu 1 (ô đang focus), patch từ client khác sửa câu 2 → thanh trên v6, ô câu 1 vẫn "đang gõ dở" (như `panels.js:595-601`: đang gõ thì không vẽ lại cả panel) |
| TAB-music-01 | có | panel trái, tab Nhạc & âm thanh (`ui/src/panels/music/MusicTab.tsx`) | thẻ "bgm.mp3", thanh `aria-valuemin 0`, `aria-valuemax 100`, `aria-valuenow 52`, chữ "52%" |
| TAB-music-02 | có | thẻ "bgm.mp3", thanh âm lượng | kéo chuột: chữ đổi 60% rồi 40% khi đang giữ, 0 POST; thả → POST /api/patch `[{"op":"set_music","id":"bgm","field":"gain","value":0.4}]`, phiên bản v7 → v8 (số phiên bản cao hơn checklist vì cùng gốc thử đã qua TAB-voice-03/07 và một lần kéo thử) |
| TAB-music-03 | có | mục "Hiệu ứng âm thanh" | `["Nét cọ đầu tiên quét bầu trời s1 + 0.2s brush.mp3","Máy quay bay xuyên khe núi giữa sang dòng sông s1 + 6.3s whoosh.mp3","Bụi lau tiền cảnh bắt đầu vẽ s3 + 0.2s brush.mp3"]` |
| TAB-music-04 | có | `?name=abm-intro&tab=music` | thanh âm lượng `data-disabled` |
| STATE-38 | có | mục "Hiệu ứng âm thanh" | chặn `/api/project` trong trình duyệt, bỏ `events` → "Chưa có hiệu ứng âm thanh nào gắn theo shot. Giao việc cho AI nếu cần tiếng nhấn." |

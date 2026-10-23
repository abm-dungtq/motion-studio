# Lời & giọng, Nhạc & âm thanh trong UI React

Nhánh `feat/react-ui-voice-music`, cắt từ `feat/react-ui` (sau tag `ui-contracts-v1`, đã merge thêm `a8a4ed4`). Vùng `voice-music`, cổng thử 4414.

## Đã làm

- `ui/src/panels/voice/index.ts`, `VoiceTab.tsx`: tab `voice` ("Lời & giọng", nhóm `audio`, `order 10`, icon `Mic`), chép `public/panels.js:193-211`.
  - Mỗi câu một thẻ: `<n>. <id>`, badge `gate` (`stale` màu `warn`, `pass` màu `ok`), ô `aria-label "Câu <n>"`.
  - "Lưu lời": không đổi thì toast "Không có gì thay đổi"; đổi thì `actions.patch([{ op: "set_line_text", id, text }])` rồi toast "Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại".
  - Câu `stale`: dòng nhắc và nút "Nhờ duyệt và lồng tiếng lại" gọi `actions.direct({ scope: "line", target, text })` với chữ của `panels.js:208`.
  - Manifest mới vẽ lại ô câu, trừ khi người dùng đang gõ trong tab (như `panels.js:595-601`).
  - Badge rail `useStaleCount()`: đếm câu `stale` từ manifest trong cache qua `useProject` (cùng query shell giữ, `staleTime: Infinity`, không mở request riêng; dùng hook thay `getQueryData` để badge render lại khi manifest đổi).
  - Dự án chỉ xem: ô câu và "Lưu lời" tắt.
- `ui/src/panels/music/index.ts`, `MusicTab.tsx`: tab `music` ("Nhạc & âm thanh", nhóm `audio`, `order 20`, icon `Music`), chép `panels.js:212-229`.
  - Thanh shadcn `Slider` 0–100 bước 1: `onValueChange` chỉ đổi chữ `%`, `onValueCommit` gửi `set_music gain = value/100` một lần khi thả. Patch bị từ chối thì thanh về mức đã lưu.
  - Hiệu ứng âm thanh: nhãn (hoặc id), `shot + fmtS(offset)`, tên file. Chữ rỗng giữ nguyên văn `:226-227`.
  - Dự án chỉ xem: thanh tắt.

## Test

- vitest vùng: `VoiceTab.test.tsx` 10 test, `MusicTab.test.tsx` 7 test (mock `@/api/queries.ts`, `@/api/actions.ts` và `say` của `@/api/client.ts`, dữ liệu theo hình `GET /api/project?name=thuy-mau-demo`). Có test kéo thanh: giữa chừng không gửi, thả ở 40 gửi `value: 0.4`.
- Toàn bộ: `npm test` pass 315, fail 0; vitest 14 file, 56 test xanh; `tsc --noEmit` sạch.
- Không gọi ElevenLabs hay TTS thật: test mock mọi hàm ghi; thử trực tiếp dùng gốc thử có runner `mcp`, nên `/api/director` chỉ xếp hàng.

## Thử trực tiếp và ảnh

- 12/12 dòng nhóm `4c` đạt, xem `reports/parity-voice-music.md`.
- Ảnh: `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/voice-music/{1440,2560}/{voice,music}.png` (`shoot.mjs` in `ok 4`).
- Server thử PID 41663 đã dừng; cổng 4414 trống.

## Yêu cầu đổi hợp đồng

Một yêu cầu, không chặn: `ui/src/components/ui/slider.tsx` chưa đưa `aria-label` tới thumb `role="slider"`. Chi tiết và cách tạm ở `reports/contract-requests-voice-music.md`.

## Ghi chú tài liệu

Vùng này không có tài liệu riêng; không cần sửa.

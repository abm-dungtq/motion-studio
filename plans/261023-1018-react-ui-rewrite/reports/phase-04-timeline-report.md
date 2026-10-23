# Timeline React: báo cáo

Timeline của Studio viết lại bằng React trong `ui/src/timeline/`, gồm năm track (Shot, B-roll, Lồng tiếng, Nhạc, SFX), thước, playhead, kéo sửa (Ripple/Roll, câu, Shift+kéo câu, nhạc, SFX), hít, zoom, menu chuột phải, M/S, thả footage vào B-roll, lưới phách và chấm từ kéo được, hoàn tác mốc, decorator của extension và phím tắt. Mọi phép tính lấy nguyên hàm của `core/timeline-edit.ts`; mỗi lần kéo gửi đúng một `/api/patch`. Playhead và xem trước khi kéo chỉ ghi `style` qua ref, không render lại khối.

## Việc đã làm

- `ui/src/core/timeline-geometry.ts` cùng `tests/timeline-geometry.test.mjs` (9 test node): toạ độ, `fitPps`, `zoomAround`, bước thước, bố cục làn nhạc và tầng SFX.
- `ui/src/timeline/`: `index.tsx` (khung, cuộn, Ctrl/Cmd+cuộn zoom, vừa khung lần đầu), `Toolbar.tsx`, `Ruler.tsx`, `Playhead.tsx`, `useDrag.ts`, `snap.ts`, `view.ts`, `Wave.tsx`, `ShotThumb.tsx`, `BrollDrop.ts`, `BlockMenu.ts`, `MuteSolo.tsx`, `Decorations.tsx`, `TimingUndo.tsx`, `keys.ts`, `tracks/*` (Shot, B-roll, Voice, Music, Sfx) và `markers/*` (BeatLayer, WordDots, markerDrag).
- `ui/scripts/perf-playhead.mjs`: đo fps khi kéo núm playhead (từ chối cổng 4317).
- Test: `ui/src/timeline/timeline.test.tsx` (16) và `ui/src/timeline/keys.test.ts` (4).

## Kiểm tra

- `npm test`: node 325 test, 324 pass, `ℹ fail 0` (1 bỏ qua); vitest 38 file, 225 test pass (20 trong `src/timeline`); `tsc --noEmit` sạch; `check-ownership.mjs timeline` in `ok timeline 31 file`; không có `fetch(`/`EventSource` trong `timeline/`.
- Parity: `reports/parity-timeline.md`, 98 dòng nhóm 4a, tất cả `có`. Thử trực tiếp trên 4412 sau khi merge `origin/feat/react-ui`, gồm cả inspector của vùng 4d (INSP-18 "Biên nhận của file trong shot / Chưa có biên nhận cho file của shot này." khi chọn shot có file; inspector beat, word, line, music, event hiện đúng tiêu đề và ô).
- Ảnh 1440 và 2560 (`shoot.mjs` in `ok 6`): `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/timeline/{1440,2560}/{timeline,timeline-perf60,timeline-readonly}.png`.

## Yêu cầu đổi hợp đồng

`reports/contract-requests-timeline.md`: bàn phím của `shell/PointMenu.tsx` (focus mục đầu khi mở, ↑/↓ đi vòng, Tab đóng). Orchestrator đã sửa ở 6991dd7; đã merge và thử lại, KEY-26/27/28 đạt. Ghi thêm: kiểu `TimingData` trong `api/` chưa khai báo trường `undo` (độ sâu hoàn tác mốc); `TimingUndo.tsx` đọc qua `markers.get().undo` nên không cần sửa ngay.

## Ghi chú tài liệu (cho phase 5)

- `docs/timeline.md` dòng 3: bỏ câu "Timeline của Studio là JavaScript thuần trong `public/`, không có bước build và không dùng React", thay bằng: timeline viết bằng React trong `ui/src/timeline/` (phép tính ở `ui/src/core/timeline-edit.ts` và `timeline-geometry.ts`).
- `README.md:58-72` (bảng phím tắt): không có phím đổi. Các phím `=`/`+`, `-`, Ctrl+Y, Backspace vốn có ở bản cũ, có thể ghi thêm vào bảng.

## Điểm dừng

Thử trên `http://127.0.0.1:4412/?name=thuy-mau-demo` (gốc thử `/tmp/ms-react-root-4412` mới tạo, server `smoke-server.mjs`), bằng Chrome điều khiển qua `playwright-core`, viewport 1440×900. Mỗi lần kéo đếm số POST `/api/patch` của trang và đọc op cuối trong `/api/log`, rồi Cmd+Z. Số giây khác cột "Cũ (4411)" của checklist vì gốc thử hôm nay có `thuy-mau-demo` dài 20 s (gốc cũ 20,601 s); dạng op và số patch giống bản cũ.

| ID | Đạt | Bằng chứng |
|---|---|---|
| TL-PROTO-01 | có | nhãn `Shot, B-roll, Lồng tiếng, Nhạc, SFX`; khối shot 4, ô B-roll 4, câu 3, nhạc 1, SFX 3; ghi chú Shot "ảnh 13:03"; lần đầu vừa khung: tl-inner 1440 px trong khung cuộn 1440 px; vạch `0s,1s,2s,3s` |
| TL-PROTO-02 | có | kéo thước → `0:07.7 / 0:20.0`; kéo núm → `0:10.6 / 0:20.0`, playhead `translateX(772.7px)`; bấm chỗ trống làn SFX → `0:10.8 / 0:20.0` |
| TL-PROTO-03 | có | Ctrl+cuộn lên: vạch thứ hai 64.5px → 74.175px; Cmd+cuộn xuống → 64.5px; nút + → 1762.5 px, − hai lần → 1182 px, Vừa khung → 1440 px, scrollLeft 0 |
| TL-PROTO-04 | có | kéo mép phải s1 +40 px (Ripple): đúng 1 POST, ops `[{"op":"resize_shot","id":"s1","duration":7.1}]` |
| TL-PROTO-05 | có | phím R → toast "Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên", nút "Roll" aria-pressed=true, title mép shot cuối "Shot cuối: Roll cần shot kế tiếp, kéo sẽ không đổi gì"; kéo mép s2 −30 px: 1 POST `[{"op":"resize_shot","id":"s2","duration":5.5},{"op":"resize_shot","id":"s3","duration":5.5}]`, tổng 20 → 20; bấm nút → "Ripple: kéo mép shot đổi độ dài, các shot sau dời theo" |
| TL-PROTO-06 | có | kéo vo-01 +20 px: 1 POST `[{"op":"move_line","id":"vo-01","start":0.8}]` |
| TL-PROTO-07 | có | Shift+kéo vo-02: 1 POST `[{"op":"move_line","id":"vo-02","start":7.133}]` (s2 chỉ có một câu; điểm thả hít vào một mốc TIMING) |
| TL-PROTO-08 | có | kéo sfx-brush-2 +25 px: 1 POST `[{"op":"move_event","id":"sfx-brush-2","start":13.12}]` |
| TL-PROTO-09 | có | nhạc phủ hết video, kéo thân: 0 POST; mép phải −20 px → `[{"op":"update_music","id":"bgm","end":19.69}]`; khi đó kéo thân +40 px → `[{"op":"update_music","id":"bgm","start":0.31,"end":20}]`; mép trái +30 px → `[{"op":"update_music","id":"bgm","start":0.5,"media_start":0.5}]` |
| TL-PROTO-10 | có | N → toast "Hít: tắt"; nút Hít → "Hít: bật", aria-pressed=true; kéo sfx-brush-1 tới gần cuối vo-01: `[data-testid=snap-line]` hiện trong lúc kéo, thả ra `[{"op":"move_event","id":"sfx-brush-1","start":5}]` (giờ đích đúng 3 số lẻ) |
| TL-PROTO-11 | có | canvas waveform có cỡ trên 3/3 câu (288×29, 237×29, 230×29) và 1/1 nhạc (1288×30) |
| TL-PROTO-12 | có | bấm s3, vo-02, bgm, sfx-whoosh: khối đó có `.sel`, cột phải chuyển sang tab "Shot" (store `pick` đúng loại và id). Sau khi merge vùng inspector: shot → "SHOT 3 · 12.5s–17.5s", câu → "CÂU vo-02 · 6.9s–10.6s", nhạc → "NHẠC · bgm.mp3", SFX → "SFX sfx-whoosh · 0:06.3" |

Không có lỗi console hay pageerror trong cả lượt thử.

Đo fps (`perf-60`, 60 shot):

```text
fps=58.9 runs=56.6,58.9,59.2
ok
```

(Lần đo đầu, trước khi tạo lại gốc thử: `fps=58.1 runs=54.1,58.1,59.0`, cũng `ok`.)

Ảnh ở 1440: `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/timeline/1440/timeline.png`, `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/timeline/1440/timeline-perf60.png`.

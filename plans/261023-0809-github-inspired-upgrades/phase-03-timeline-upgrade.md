# Phase 3: nâng cấp timeline

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/timeline-upgrade`
- **Nhánh:** `feat/timeline-upgrade`
- **Cổng server thử:** 4403
- **Effort:** 12h
- **Ưu tiên:** P2
- **Phụ thuộc cứng:** phase 1, cụ thể là seam route và `addTimelineDecorator` phải được giữ nguyên. Không cần agent CLI.

## Mục tiêu

1. **Ripple, roll và snapping** nâng cấp.
2. **Multi-track:**
   - mỗi bed nhạc một làn;
   - SFX xếp tầng khi chồng nhau;
   - một làn B-roll/asset lấy từ `shot.assets`.
3. **Waveform và thumbnail dựng trong trình duyệt**, có cache.
4. **Mốc từ (`W()`) và phách (`B()`) kéo được, ghi ngược:**
   - phách sửa `beat0` trong `<bgm>.beats.json`;
   - từ sửa `start`/`end` trong `<voice>.words.json`;
   - sau đó chạy lệnh `timing` của provider để dựng lại `TIMING` và `timing.json`.

## Hiện trạng đã kiểm

**Đã có, không viết lại:**
- `public/timeline.js` (314 dòng) có bốn track: Shot, Lồng tiếng, Nhạc, SFX. Kéo thì xem trước, thả thì gửi một patch. Có hít (`snapTargets` / `snap` ở `public/timeline-edit.js:158`, `:184`), M/S, zoom quanh con trỏ.
- `public/waveform.js` giải mã bằng WebAudio, 200 điểm/giây, tối đa 3 lần giải mã cùng lúc, cache trong RAM theo URL.
- Phách và đầu từ hôm nay chỉ để xem (`beatTimes` ở `timeline-edit.js:125`, `wordStarts` ở `:139`). Dữ liệu là `ctx.state.timing`, do `public/player.js:25` đọc `window.TIMING` từ iframe.

**Op của gateway** (`gateway.mjs:117-232` của plugin): `resize_shot`, `move_line`, `set_shot`, `set_line_text`, `set_music`, `update_music`, `move_event`, `add_event`, `remove_event`, `add_shot`, `remove_shot`.
- `resize_shot` đã ripple các shot sau (`ripple(i + 1, delta)`).
- `remove_shot` ripple khép khoảng trống (`ripple(i, -(s.end - s.start))`).
- `set_shot` nhận `name | transition_in | motion_note | assets` (`gateway.mjs:62`).
- **Không có op dời shot hay đặt clip overlay tự do.**

**Dữ liệu thời gian** (`project.json` thật, `abm-intro`):
- line có `file: "assets/voice/01.mp3"`, nên words ở `<file>.words.json`;
- music có `file`, nên lưới phách ở `<file>.beats.json` (`beat0`, `beatLen`, `kick`, `drops`; `beat-grid.mjs:28`);
- `timing.mjs` đọc hai file đó rồi ghi `TIMING` vào HTML và `timing.json`. Tiêu đề `timing.mjs` có câu "never edit the seconds by hand", nghĩa là không sửa số giây trong HTML; sửa nguồn rồi chạy lại là đúng cách.
- Phase 1 thêm `P.commands.timing` và `P.commands.beatGrid`.

## Repo học hoặc chép (đối chiếu trước khi viết)

| Repo | Giấy phép | Lấy gì |
|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) `packages/studio` | Apache-2.0 | **Đọc trước tiên.** Timeline kéo thả, snapping, cách vẽ waveform và thumbnail cho chính runtime ta render. Ghi một bảng "họ có / ta có / lấy gì" vào `docs/timeline.md`, trước khi viết mã. Mã là React/Zustand: chỉ chép thuật toán (snap, gom thumbnail, LOD waveform), không chép component |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT | Ripple và roll, snapping có ngưỡng theo px, xếp làn khi clip chồng nhau, phím tắt |
| [omni-media/omniclip](https://github.com/omni-media/omniclip) | MIT | Lấy khung bằng WebCodecs, cache thumbnail |
| [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | Chỉ dùng nếu `HTMLVideoElement.seek` + canvas không đủ chính xác hoặc quá chậm (> 150 ms/khung). Khi đó vendor bản ESM build vào `public/vendor-mediabunny.js`, đầu file ghi URL, phiên bản và MPL-2.0 |
| [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) | MIT | "Time events": mốc có tên, kéo trên editor, ghi vào file meta để mã đọc. Ta làm cùng ý đó, với nguồn là `words.json` và `beats.json` |

Clone vào `/tmp/ms-ref/<repo>`, chỉ đọc, không cài.

## Sở hữu file

**Sửa** (sau phase 1, chỉ phase này được sửa):
- `public/timeline.js`
- `public/timeline-edit.js`
- `public/waveform.js`
- `public/player.js`
- `public/app.js`: phím mới trong `runKey`
- `public/index.html`: nút trên `.timeline-bar`
- `public/inspector.js`: mục thuộc tính cho mốc
- `public/app.css`

**Tạo mới:**
- `public/timeline-lanes.js`: xếp làn
- `public/timeline-markers.js`: kéo mốc
- `public/thumbs.js`: thumbnail
- `public/peaks-cache.js`: IndexedDB
- `routes/timing.mjs`
- `routes/timeline-assets.mjs`
- `lib/timing-edit.mjs`: sửa `words.json` và `beats.json`, sao lưu, hoàn tác
- `docs/timeline.md`
- Test: `tests/timeline-ripple.test.mjs`, `tests/timeline-lanes.test.mjs`, `tests/timing-edit.test.mjs`

**Không đụng:** `server.mjs`, `panels.js`, `agent.js` và mọi file của phase khác. API `addTimelineDecorator` của phase 1 phải chạy y như cũ, có test.

## Luồng dữ liệu

```text
Kéo mép shot (chế độ Ripple, mặc định)  → [resize_shot A]                         (gateway tự ripple)
Kéo mép shot (chế độ Roll, phím R)      → [resize_shot A d+Δ, resize_shot B dB−Δ] (tổng thời lượng giữ nguyên)
Ripple delete shot trống                → [remove_shot]                           (gateway khép khoảng trống)
Kéo câu thoại với Shift                 → move_line cho câu đó và mọi câu sau trong cùng shot dời theo Δ (một patch)

Mốc phách (kéo một vạch phách)          → POST /api/timing/beat  { name, music_id, base_sha, beat0 }
Mốc từ (kéo một chấm đầu từ)            → POST /api/timing/word  { name, line_id, index, base_sha, start }
   routes/timing.mjs → lib/timing-edit.mjs
     ├─ tìm file: project.json line.file / music.file + ".words.json" / ".beats.json"
     ├─ kiểm: từ không vượt từ kề (start < end, ≥ 10 ms); beat0 trong [0, beatLen)
     ├─ sao lưu → .opus/timing-edits/<ts>-<file>.json ; ghi nguyên tử ; sha khác base_sha → 409
     └─ job "timing": node <P.commands.timing> --project <dir> → TIMING mới → SSE manifest/iframe reload
   Hoàn tác: POST /api/timing/undo { name } → khôi phục bản sao lưu gần nhất → chạy timing lại

Thumbnail: renders/*.mp4 hoặc demo/*.mp4 mới nhất (theo mtime) → <video> ẩn, seek tới giữa mỗi shot
   → canvas 160×90 → IndexedDB "ms-thumbs" khoá (url, mtime, t) ; không có render → không thumbnail
Waveform: peaks() giữ nguyên thuật toán; thêm IndexedDB "ms-peaks" khoá (url, size, mtime) và LOD 25/50/200 điểm/s theo zoom
Làn: music[] chồng thời gian → mỗi bed một làn; events SFX → xếp tầng tham lam (interval graph), tối đa 4 tầng
     làn "B-roll" = shot.assets (chỉ vẽ; thả file từ panel Footage vào shot → set_shot assets)
```

## Các bước

1. **Đối chiếu.** Đọc `hyperframes/packages/studio` và OpenCut, viết bảng so sánh vào `docs/timeline.md`. Mục nào HyperFrames đã có ở dạng nhúng được (web component, iframe studio-server) thì ghi rõ "nhúng hay tự viết, vì sao". Mặc định tự viết, vì Studio không có bước build và không dùng React.
2. **Logic thuần trong `timeline-edit.js`:**
   - `rollOps(m, shotId, dt)`;
   - `rippleLineOps(m, lineId, t)`;
   - `stackLanes(intervals, max)`;
   - `markerDrag(timing, kind, …)`.

   Không import gì, để Node test được (theo comment đầu file).
3. **Chế độ sửa.**
   - Nút "Ripple / Roll" trên `.timeline-bar`, phím R.
   - Shift khi kéo câu để ripple các câu sau.
   - Phím mới đặt trong `keyAction` (`timeline-edit.js:101`) và `runKey` (`app.js`).
   - Bảng phím tắt đầy đủ đặt trong `docs/timeline.md`. Bảng phím tắt của README chỉ được thêm dòng R và Shift-kéo, ở commit cuối khi rebase (luật README trong `plan.md`).
4. **Làn.**
   - `timeline-lanes.js` vẽ nhạc nhiều làn, SFX xếp tầng, và làn B-roll từ `shot.assets` (nhãn tên file, thumbnail nếu là ảnh hay video trong dự án).
   - Thả một file từ panel Footage lên shot → `set_shot assets` với mảng cũ cộng file mới.
     - `manifest.mjs:56` của provider chỉ nhận đường dẫn tương đối **trong dự án**. File nằm ở `footage/` hay `shared-assets/` của workspace thì phải chép vào `<dự án>/assets/footage/` trước, không ghi đè (thêm `-2`).
     - Việc chép do route mới `POST /api/timeline/asset { name, shot, base, path }` làm, đặt trong `routes/timeline-assets.mjs`. Nguồn phải qua cùng luật realpath của `media.mjs` (`allowed`); chỉ import, không sửa. Mục footage trong `panels.js` đã kéo được với `dataTransfer` kiểu `text/x-ms-media` = `{ rel, kind }`; phase 1 thêm phần này (phase 1, bước 2). Phase 3 chỉ nhận thả, không sửa `panels.js`.
5. **Thumbnail và waveform:** `thumbs.js`, `peaks-cache.js`, LOD.
6. **Mốc kéo được:**
   - `timeline-markers.js`, `lib/timing-edit.mjs`, `routes/timing.mjs`;
   - inspector có mục mốc: giờ hiện tại, giờ gốc, nút "Về gốc".
7. **Cảnh báo duyệt lại.** Đổi mốc làm đổi hoạt hình bám lời hoặc bám phách. Sau khi job `timing` xong, toast và inspector ghi "Animatic cần duyệt lại", giống luật retime của đạo diễn. Studio không tự ghi dòng `approval:`.
8. **Thử thật trên 4403** với `ms-smoke-3`, dự án tạo từ `new-project.sh` có giọng và nhạc thử:
   - kéo phách;
   - kéo từ;
   - hoàn tác;
   - roll;
   - shift-ripple.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0`, kể cả `tests/timeline-edit.test.mjs` cũ (không sửa kỳ vọng cũ).
- `tests/timeline-ripple.test.mjs`:
  - `rollOps` trên manifest mẫu → áp vào bản sao bằng `P.gateway.patch` trong tmp (fakePlugin không có gateway thật, nên test này cần plugin thật như `studio-server.test.mjs`) → `duration` không đổi, mép A/B dời Δ;
  - Δ làm B < 0,5 s → trả `error`;
  - `rippleLineOps` dời đúng các câu sau trong shot, câu ở shot khác giữ nguyên.
- `tests/timeline-lanes.test.mjs`:
  - `stackLanes` với 5 khoảng chồng → số làn tối thiểu và ổn định (cùng input cùng output);
  - quá `max` thì dồn vào làn cuối và có cờ `overflow`.
- `tests/timing-edit.test.mjs`:
  - `words.json` mẫu: sửa `index 2 start` → file đổi đúng một giá trị;
  - vượt từ kề → lỗi 422;
  - `base_sha` cũ → 409;
  - có bản sao lưu;
  - `undo` khôi phục đúng sha cũ;
  - `beats.json`: `beat0` ngoài `[0, beatLen)` → 422;
  - route gọi `P.commands.timing`: test thay bằng script giả ghi file đánh dấu và khẳng định nó chạy với `--project <dir>`.
- Test hồi quy cho seam: decorator đăng ký qua `addTimelineDecorator` vẫn vẽ. Kiểm bằng hàm thuần mà `timeline.js` dùng để gom decorator, tách ra cho test được.

## Tiêu chí nghiệm thu

- Trên 4403:
  - roll giữa hai shot giữ nguyên `duration` (đọc `/api/project` trước và sau);
  - ripple bằng mép phải dời các shot sau;
  - Shift-kéo câu dời các câu sau.
- Kéo một vạch phách 50 ms → `bgm.mp3.beats.json` `beat0` đổi 0,05 → `timing.json.beat0` đổi theo sau job `timing` → vạch phách trên thước dời. Kéo một đầu từ → `words.json` đổi → `timing.json` đổi. "Hoàn tác mốc" trả cả hai file về sha cũ.
- Thumbnail hiện trên làn Shot khi có `renders/*.mp4`. Lần mở thứ hai không giải mã lại: tab Network không có request range mới cho file đó.
- Hai bed nhạc chồng nhau hiện thành hai làn. 3 SFX chồng nhau hiện 3 tầng.
- Phím tắt cũ (bảng README) vẫn chạy: thử tay từng dòng, ghi kết quả vào PR.
- Server 4403 đã dừng.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Sửa `words.json` làm lệch nhép miệng hay chữ chốt | Vừa | Cao | Sao lưu và hoàn tác; giới hạn trong từ kề; cảnh báo duyệt animatic; gợi ý chạy `P.commands.wordSync` sau khi sửa (nút "Kiểm khớp lời") |
| Đang sửa mốc thì đạo diễn chạy `timing` | Thấp | Vừa | Có job `director` đang chạy cho dự án thì `routes/timing.mjs` trả 409 |
| Thumbnail từ bản render cũ, lệch với timeline mới | Vừa | Thấp | Nhãn "từ bản render <giờ>"; render cũ hơn `project.json` updated thì làm mờ |
| `timeline.js` sửa nhiều, vỡ hành vi kéo cũ | Vừa | Cao | Giữ nguyên đường kéo cũ cho chế độ Ripple mặc định; test logic thuần; thử tay bảng phím |
| Track overlay tự do cần đổi schema | Chắc chắn nếu muốn | Vừa | Không làm trong phase này (xem PR upstream) |

## Hoàn tác

`git revert -m 1 <merge>`. File `words.json`/`beats.json` đã sửa khôi phục được từ `.opus/timing-edits/`. Chỉ cần chạy lại `timing` là `TIMING` về như cũ.

## PR upstream (chỉ khi người dùng muốn track overlay tự do)

Mặc định **không** làm. Nếu người dùng trả lời "có" cho câu hỏi 1 trong `plan.md`, mở PR riêng từ `/Volumes/2/opus-video-upstream-work`:

- schema: thêm `overlays: [{ id, file, start, end, media_start, track, gain? }]`;
- gateway: thêm `add_overlay` / `move_overlay` / `trim_overlay` / `remove_overlay` (có ripple theo shot không: quyết trong PR);
- `manifest.validate`, `derive`, test.

Studio dùng các op đó qua `P.gateway.patch`, chỉ khi `P.api` ≥ bản có `overlays`. Phase này chỉ chuẩn bị chỗ vẽ làn: làn B-roll đọc được cả `overlays` khi có.

## PR

Tiêu đề: `feat(timeline): roll and ripple, lanes, cached waveforms and thumbnails, draggable beat and word markers`.

Commit gợi ý:
1. `feat(timeline): roll edit and shift-ripple for lines`
2. `feat(timeline): music, sfx and asset lanes`
3. `feat(timeline): cached peaks and render thumbnails`
4. `feat(timing): draggable beat and word markers with undo`
5. `docs(timeline): comparison and shortcuts`

Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt trượt, hoặc cần sửa file ngoài sở hữu (ví dụ `server.mjs` hay `panels.js`): **dừng**, không tự ứng biến. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output;
- điều kiện đạt bị trượt;
- `file:line`.

Áp dụng lời khuyên rồi chạy lại Verify. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.

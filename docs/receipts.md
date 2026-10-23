# Biên nhận và cổng chất lượng

Mỗi thao tác tạo ra file (sinh ảnh, ffmpeg, xuất file, kiểm media) ghi một biên nhận. Biên nhận cho biết:

- ai làm và bằng gì: `op`, `actor`, `tool`, `params`, `inputs`;
- file ra, kèm `sha256` và cỡ;
- từng kiểm chất lượng đã chạy và kết quả.

Biên nhận nằm ở `<dự án>/.opus/receipts/<yyyymmdd>/<op>-<id>.json`. Định dạng do `lib/receipts.mjs` ghi; xem [extensions.md](extensions.md). Xoá thư mục này không làm hỏng dự án.

Ý tưởng "Video Receipt" và danh sách cổng chất lượng học từ [kinocut](https://github.com/KyaniteLabs/kinocut) (Apache-2.0). Ngưỡng dưới đây là của Studio, chỉnh cho video ngắn làm bằng AI.

## Xem trên giao diện

- **Tab Xuất bản → Biên nhận:** 20 biên nhận mới nhất, gồm verdict, op, actor, giờ và file ra. Bấm một dòng để xem từng kiểm (✓ đạt, ✗ trượt, ! cảnh báo) và JSON đầy đủ. "Làm mới" đọc lại ngay.
- **Inspector của shot:** biên nhận có file ra nằm trong `assets` của shot đó.

## Verdict

Mỗi kiểm có một mức:

- `fail`: trượt thì biên nhận bị chặn;
- `warn`: trượt thì chỉ cảnh báo.

Verdict của biên nhận là:

- `fail` khi có một kiểm mức `fail` trượt;
- `warn` khi chỉ có kiểm mức `warn` trượt;
- `pass` khi mọi kiểm đều đạt.

Verdict được tính khi đọc biên nhận, nên biên nhận cũ cũng có verdict. Một kiểm đã gỡ khỏi Studio được tính là mức `fail`.

## Các kiểm

| Kiểm | Áp cho | Cách đo | Đạt khi | Mức |
|---|---|---|---|---|
| `exists-nonempty` | mọi file | stat | file có và khác 0 byte | fail |
| `probe-readable` | ảnh, video, audio | ffprobe | đọc được | fail |
| `duration-match` | video, audio | ffprobe | lệch ≤ 1 khung so với thời lượng mong đợi (nếu có) | fail |
| `resolution-fps` | video | ffprobe | khớp rộng, cao, fps mong đợi (nếu có) | fail |
| `black-frames` | video | `blackdetect=d=0.5:pix_th=0.10` | không có đoạn đen ≥ 0,5 s, trừ khi được phép | fail |
| `frozen-frames` | video | `freezedetect=n=-60dB:d=1` | không có đoạn đứng hình ≥ 1 s, trừ freeze-frame có chủ đích | fail |
| `silence` | audio, video có tiếng | `silencedetect=n=-50dB:d=2` | không có đoạn im ≥ 2 s ở giữa (đầu và cuối được) | fail |
| `loudness` | audio | `ebur128` | độ to tích hợp trong [-23, -9] LUFS | warn |
| `clipping` | audio | `astats` | peak < -0,1 dBFS | fail |
| `alpha-coverage` | PNG có kênh alpha | `alphaextract` + `signalstats` | điểm đục (alpha ≥ 128) chiếm 3–97 % | fail |
| `min-size` | ảnh | ffprobe | cạnh ngắn ≥ 512 px | fail |

- Video dài hơn 10 phút chỉ được lấy mẫu ba đoạn 30 giây cho `black-frames` và `frozen-frames`, ở khoảng 10 %, 50 % và 85 % thời lượng.
- File ffprobe không đọc được đã trượt `probe-readable`. Các kiểm media khác bỏ qua file đó, không báo lỗi lần nữa.
- PNG không có kênh alpha thì `alpha-coverage` ghi "bỏ qua" và tính là đạt.

## Chỉnh ngưỡng

Thêm khoá `quality` vào `studio.json` (`~/.config/motion-studio/studio.json` hoặc `$MOTION_STUDIO_STATE`). Mỗi khoá là một số và ghi đè giá trị mặc định:

```json
{
  "quality": {
    "black_min_s": 0.5, "black_pix_th": 0.1,
    "freeze_noise_db": -60, "freeze_min_s": 1,
    "silence_db": -50, "silence_min_s": 2,
    "loudness_min": -23, "loudness_max": -9,
    "peak_max_db": -0.1,
    "alpha_min_pct": 3, "alpha_max_pct": 97,
    "min_side_px": 512,
    "sample_over_s": 600, "sample_window_s": 30
  }
}
```

Lưu ý: hiện Studio chỉ giữ các khoá `director`, `root` và `agents` khi dừng hoặc khởi động lại (`SETTINGS` trong `lib/config.mjs`). Vì vậy khoá `quality` bị bỏ ở lần khởi động sau, cho tới khi `quality` được thêm vào `SETTINGS`.

## Thông số mong đợi và ngoại lệ có chủ đích

`duration-match` và `resolution-fps` chỉ so khi biết thông số mong đợi. Không có thì hai kiểm này chỉ ghi số đo được và tính là đạt.

Code ghi biên nhận khai thông số trước khi gọi `writeReceipt`, bằng `withExpected()` của `lib/quality/video.mjs`:

```js
import { withExpected } from "./lib/quality/video.mjs";
import { writeReceipt } from "./lib/receipts.mjs";

await withExpected([out], { duration: 4, width: 1920, height: 1080, fps: 30, allow_freeze: true }, () =>
  writeReceipt(dir, { op: "fx-freeze", actor: "studio", outputs: [out], params: { at: 2 } }));
```

- `allow_black`, `allow_freeze` và `allow_silence` cho phép đoạn đen, đứng hình hay im lặng có chủ đích. Kiểm vẫn chạy và ghi số đo, nhưng tính là đạt.
- Thông số chỉ áp trong lúc ghi biên nhận đó.

## Kiểm theo yêu cầu

- HTTP: `POST /api/media/check { name, files, expected?, allow? }` (cần token). Trả biên nhận `media-check` kèm verdict. `expected` là `{ duration, width, height, fps }`; `allow` là `{ black, freeze, silence }`.
- Tool: `media_check` với cùng tham số, cộng `project` (xem [mcp.md](mcp.md)).
- Đọc lại: `GET /api/receipts?name=&op=&limit=` và `GET /api/receipt?name=&id=`, hoặc tool `receipts_list` và `receipt_get`.

## Mẫu biên nhận

```json
{
  "id": "mvl2k9x0-3fa1c2",
  "op": "media-check",
  "actor": "director:r-20261023091500-ab12",
  "tool": { "name": "media_check" },
  "params": { "duration": 12, "width": 1920, "height": 1080, "fps": 30 },
  "inputs": { "files": ["renders/demo-final.mp4"] },
  "outputs": [{ "path": "renders/demo-final.mp4", "size": 7340032, "sha256": "…" }],
  "checks": [
    { "id": "exists-nonempty", "file": "renders/demo-final.mp4", "pass": true, "detail": "7340032 byte", "level": "fail" },
    { "id": "duration-match", "file": "renders/demo-final.mp4", "pass": true, "detail": "12.000 s, mong đợi 12 s, lệch 0.000 s (cho phép 1 khung = 0.033 s)", "level": "fail" },
    { "id": "black-frames", "file": "renders/demo-final.mp4", "pass": true, "detail": "không có đoạn đen ≥ 0.5 s", "level": "fail" },
    { "id": "silence", "file": "renders/demo-final.mp4", "pass": true, "detail": "không có đoạn im ≥ 2 s ở giữa", "level": "fail" }
  ],
  "pass": true,
  "verdict": "pass",
  "started": "2026-10-23T02:15:01.000Z",
  "ended": "2026-10-23T02:15:04.000Z",
  "written": "2026-10-23T02:15:04.000Z",
  "file": ".opus/receipts/20261023/media-check-mvl2k9x0-3fa1c2.json"
}
```

`verdict` và `level` không nằm trong file. Studio thêm chúng khi đọc.

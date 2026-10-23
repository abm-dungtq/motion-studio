# Báo cáo phase 4: export NLE (FCPXML, xmeml, OTIO)

- **PR:** https://github.com/abm-dungtq/motion-studio/pull/3 (chưa merge)
- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/nle-export`, nhánh `feat/nle-export`, tách từ `main` ở `f614d77`. Lúc đẩy nhánh, `origin/main` chưa có commit mới nào.
- **Commit:**
  1. `07c9551 feat(nle): rational time and timeline writers`
  2. `5175963 feat(bundle): write NLE timelines next to the layers`
  3. `889d3bc docs(nle): open the bundle in an editor`
- **`npm test`:** 160 test, đạt 159, lỗi 0, bỏ qua 1. Main có 141 test, nên phase thêm 19. 8 test cũ của `bundle.test.mjs` vẫn đạt.

## Đã làm

1. **Quyết định vendor: tự viết.** Đã clone ChatOctopus/timeline (commit `352d8f8`) và OpenTimelineIO (commit `eee67fd`) vào `/tmp/ms-ref/`, chỉ đọc. ChatOctopus/timeline trượt cả ba điều kiện vendor: có dependency runtime `fast-xml-parser`, viết bằng TypeScript cần build, và dài khoảng 8.126 dòng. Vì vậy không cần chạy test của repo đó. Quyết định được ghi trong `docs/nle-export.md`.
2. **`lib/nle/time.mjs`:** `rational(fps)` (29.97 → 30000/1001, 23.976 → 24000/1001), `frames(n, fps)` (rút gọn bằng UCLN, `frames(45, 30)` = `"3/2s"`), `tc(n, fps)`, `timebase` và `ntsc`.
3. **Ba bộ ghi:** `fcpxml.mjs` (1.10 mặc định, 1.8 tuỳ chọn), `xmeml.mjs` và `otio.mjs`. Cả ba dùng chung mô hình `timeline()` trong `index.mjs`. Mô hình kiểm manifest ở biên:
   - shot phải nối liền nhau, và shot cuối hết ở đúng `frames`;
   - đường file phải tương đối trong bundle;
   - fps, width và height phải hợp lệ.

   `writeNle` dựng xong cả ba chuỗi rồi mới ghi file, nên khi một định dạng lỗi thì không file nào được ghi.
4. **`bundle.mjs`:**
   - thêm bước 6 "Timeline NLE" trước khi ghi `manifest.json`;
   - thêm cờ `--nle fcpxml,xmeml,otio | none` (mặc định cả ba) và `--fcpxml-version 1.10 | 1.8`;
   - manifest có thêm trường `nle`, schema vẫn là `@1`;
   - cập nhật comment đầu file.

   Bước 6 lỗi thì vẫn xoá cả bundle và thoát 1.
5. **`lib/tools/nle.mjs`:** tool `nle_export` gọi `POST /api/bundle` qua `env.studio`, chờ job `export` xong, rồi đọc `manifest.json` của bundle (`meta.output`) và trả đường tuyệt đối của ba file.
6. **Docs:** `docs/nle-export.md` gồm cách mở trong Resolve, Premiere và Final Cut, các cờ, trường `nle`, giới hạn và nguồn. README có thêm một dòng ở mục "Bộ lớp dựng", CHANGELOG có thêm một dòng dưới "Chưa phát hành". Cả hai nằm ở commit cuối.

## Nghiệm thu

| Tiêu chí | Kết quả |
|---|---|
| `npm test` đạt `fail 0`, 8 test cũ của bundle vẫn đạt | Đạt: pass 159, fail 0, skipped 1 |
| `rational(29.97)` = `30000/1001`; `frames(45, 30)` = `"3/2s"` | Đạt |
| Tổng clip V1 = `frames`, không lệch khung nào | Đạt ở 30, 29.97 và 23.976 fps, kiểm trên cả ba định dạng |
| FCPXML và xmeml qua `xmllint --noout`; số `asset-clip` trên spine = số shot; số `marker` = số câu + số SFX; "Công ty bạn" giữ dấu | Đạt |
| OTIO: `JSON.parse` được; gốc là `Timeline.1`; số clip Video = số shot; tổng `duration.value` = `frames` | Đạt |
| So từng byte với file vàng (`now` cố định) | Đạt: `timeline.fcpxml`, `timeline.xml`, `timeline.otio` và `timeline-1.8.fcpxml` |
| `&`, `<` (cả `"` và `'`) được thoát đúng | Đạt |
| `bundle.test.mjs`: có ba file, `manifest.nle.fcpxml === "timeline.fcpxml"`; `--nle none` không ghi file nào | Đạt. Khẳng định nằm trong test ffmpeg có sẵn |
| OTIO thật đọc `timeline.otio` | Test bỏ qua vì `~/.claude/skills/.venv` (Python 3.12) chưa có `opentimelineio`, và không cài gói vào đó. Đã chạy tay đúng lệnh của test bằng OTIO 0.18.1 trong venv tạm `/tmp` (Python 3.12), ra `3 240 4`. Venv tạm đã xoá |
| Bộ lớp dựng thật trên 4404 có đủ ba file | Đạt: `ms-smoke-4/renders/ms-smoke-4-20261023-091600-bundle/`, job thoát 0. Chi tiết ở mục dưới |
| Thử mở trong NLE | **Chưa thử mở trong NLE.** `ls /Applications` không có Resolve, Premiere hay Final Cut. Đã ghi trong PR và trong docs |
| Server 4404 đã dừng | Đạt: `lsof -i :4404` rỗng, 4317 vẫn PID 63883 |

**Thử thật trên 4404:**

- Dự án `ms-smoke-4` gồm 4 shot, 3 câu và 2 SFX, dài 12 giây (360 khung).
- `manifest.nle` = `{ fcpxml, xmeml, otio, absolute_paths: true }`.
- FCPXML hợp lệ theo DTD 1.10 của Apple (`xmllint --dtdvalid`), và mọi đường `file://` trỏ tới file có thật. xmeml là XML hợp lệ.
- OTIO 0.18.1 đọc được 4 shot trên V1, 3 stem, 5 marker, tổng 360 khung.
- Ảnh chụp ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-nle-shots/` gồm `01-bundle-running.png` và `02-bundle-done.png`.

**Kiểm thêm ngoài phase file:** DTD 1.8 và 1.10 của Apple lấy từ repo CommandPost, lưu ở `/tmp/ms-ref/fcpxml-dtd/`, không đưa vào repo. Cả hai bản FCPXML đều qua `--dtdvalid`. Lần kiểm này bắt được một lỗi: bản 1.8 có thuộc tính `videoSources` mà DTD 1.8 không khai. Lỗi đã sửa trước khi commit.

## Lệch so với phase file

- `--fcpxml-version` được làm thành cờ thật của `bundle.mjs`. Phase file chỉ nhắc cờ này ở cột giảm thiểu rủi ro.
- Có thêm file vàng `timeline-1.8.fcpxml` và một test cờ sai (`--nle edl`, `--fcpxml-version 1.7` → exit 2) trong `tests/nle-export.test.mjs`. Test này nằm ở đây vì phase file chỉ cho thêm khẳng định vào test ffmpeg của `bundle.test.mjs`.
- `absolute_paths` là `false` khi chỉ ghi OTIO, vì OTIO dùng đường tương đối. Mặc định cả ba định dạng thì vẫn là `true`, như phase file.
- Shot đầu bắt đầu sau khung 0 thì timeline lấy khung `[frame_in đầu, frames)`. Stem được cắt đầu cùng số khung đó và marker dời theo, để không lệch tiếng.
- Route `/api/bundle` (`server.mjs`) không nhận `--nle`, nên tool `nle_export` luôn ghi cả ba định dạng. Phase này không được sửa `server.mjs`.

## Dọn dẹp

- Server 4404 (PID 40580) đã dừng. Phiên trình duyệt `ms-smoke-4` đã đóng. Đã xoá `/tmp/ms-smoke-4.mjs`, venv OTIO tạm và các file nháp.
- Các bản clone trong `/tmp/ms-ref/` (`timeline`, `OpenTimelineIO`, `fcpxml-dtd`) vẫn còn, vì đây là chỗ đọc tham chiếu dùng chung.
- **Dự án thử `/Volumes/2/Edit-Video/ms-smoke-4` vẫn còn**, gồm cả bundle đã xuất. Dự án này là bản sao của `ov3-e2e-cuachinh`, không chép `renders/`. Dự án gốc chỉ được đọc. Xoá `ms-smoke-4` cần người dùng đồng ý.

Status: DONE_WITH_CONCERNS
Summary: Bộ lớp dựng nay ghi `timeline.fcpxml`, `timeline.xml` và `timeline.otio`, có cờ `--nle` và tool `nle_export`. npm test đạt 159, lỗi 0, bỏ qua 1. Thử thật trên 4404 đủ ba file, FCPXML hợp lệ theo DTD của Apple, OTIO thật đọc đúng. PR #3 đã mở, chưa merge.
Concerns/Blockers: Chưa thử mở trong NLE thật, vì máy không có Resolve, Premiere hay Final Cut. Test đọc bằng OTIO thật bị bỏ qua vì venv của skill thiếu gói (đã kiểm tay). Dự án thử `ms-smoke-4` chờ người dùng đồng ý mới xoá.

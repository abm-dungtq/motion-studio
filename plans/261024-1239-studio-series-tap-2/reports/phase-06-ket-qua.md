# Phase 06: bài kiểm thật, đợt vẽ bà nội

Ngày 2026-10-24 (Asia/Saigon). Trạng thái: xong. Tờ nhân vật bà nội đã duyệt từ Studio (người điều phối duyệt thay), rig dựng được trong Studio. Mốc dừng 1 không xảy ra, rig không phải đi đường thoát.

## Studio thử

- Cổng 4420, state `$T/studio.json`, root `$T/root-series` (symlink `a-01` → `$C/video/a-01`; `a-02` do Studio tự nối). `OPUS_VIDEO_HOME=$OVC` @ `17745d0`. Không đặt `MOTION_STUDIO_AGENT_PATH`: dùng `codex-pool`, `claude` thật.
- pid 47504 (lần mở đầu), rồi 64586 sau khi nạp bản sửa #27. Đã dừng; cổng 4420 trống.
- Studio 4317 vẫn pid 82168, `~/.config/motion-studio/studio.json` không đổi.
- `find "$C/video/a-01" -newer plan.md -type f` cho 0 file ngay sau 6.1 và lúc kết thúc.

## Sao lưu

`/Volumes/2/Hoạt hình/plans/backups/song-lag-phase06-20261024/`: `roles.json`, `cast.json`, `studio-series.json`, `characters.ls`, `refs.ls`. `roles.json`, `cast.json` không bị đổi trong phase này.

## Kết quả từng task

- 6.0: qua (`OK-BACKUP`, `OK-NO-A02`, `/api/projects` có `a-01`).
- 6.1: `POST /api/series/episode` từ `a-01` → job `new-episode` exit 0, `CREATED $C/video/a-02`, biên nhận `series-episode` nằm trong a-02. `POST /api/import` ghi `project.json` v1. Đã chép kịch bản nguồn vào `script/kich-ban-nguon.md`. Verify: `OK-A02-SYMLINK`, BRIEF có `series:`, `episode: 2`, `title: Tài Khoản Facebook Đầu Tiên`, `OK-MANIFEST`, `/api/series?name=a-02` trả "Sóng Lag" và `dir` kết thúc `series/song-lag`.
- 6.2: lần đầu trượt vì lỗi mã (xem `phase-06-su-co.md`). Đã sửa bằng PR #27, gửi lại đúng yêu cầu. Đạo diễn viết `assets/gen/batches/ba-noi-design.json` (2 ảnh `pose`, nền xanh) rồi gọi `asset_batch`. Thẻ `c-mvm47u68-82dd` ghi "2 ảnh, codex-pool, ước 2 lượt vẽ; acct1 còn 17%, acct2 còn 43% trong 5 giờ". Đồng ý lúc 15:07:02; job chạy 15:07:02–15:10:11, exit 0. Kết quả: 2 ảnh `needs_review` (Verify 6.2 `OK-BATCH`), 4 biên nhận `image-generate`, 4 `image-check`.
- 6.3: đã xem cả bốn ảnh gốc và hai ảnh tách nền. Cả bốn đúng một bà cụ, nền tách sạch, nét cùng họ với tập 1. Đã duyệt phương án B (`pose-stand-b`: ngồi xếp bằng trên phản, điện thoại bàn có dây, quạt nan). Đạo diễn cũng đề xuất B. Không vẽ lại. Verify: `OK-APPROVED` (ngày 2026-10-24), `S/refs/ba-noi-hd/codex/pose-stand-b.png`, DEMO.md có dòng `character:ba-noi`.
- 6.4: đạo diễn ghi `assets/gen/rig-src/poses.tsv` (2 dòng) và đợt `ba-noi-poses`, lấy ảnh thiết kế đã duyệt làm tham chiếu đầu. Thẻ `c-mvm4fa55-aa31` ghi "2 ảnh, ước 2 lượt vẽ; acct1 còn 17%, acct2 còn 90%". Đồng ý lúc 15:12:41; job chạy 15:12:42–15:15:42, exit 0. Kết quả: 2 ảnh `needs_review`, chỉ trượt `flat_green`; `right_character` qua. Đã duyệt cả hai. Verify: hai ảnh ở `S/refs/ba-noi-hd/poses/`, `OK-PREVIOUS` (`previous` giữ lần duyệt thiết kế).
- 6.5: chia làm hai yêu cầu để người điều phối đọc `hd-poses.mjs` trước khi Studio chạy nó. Yêu cầu một: đạo diễn viết 27 file nguồn và đưa vào S bằng 27 lần `series_file_put` (`character.json` tier design, 4 biểu cảm, `head-front.pxl`, mắt, lông mày, miệng, `src/hd/stand.pxl` từ `import-sprite`, `src/hd-poses.mjs`). Đã đọc `hd-poses.mjs`: chỉ gọi `buildPoses` của `tools/lib/hd-rig.mjs`, không ghi file nào khác. Yêu cầu hai: `hd-poses` lần 1 exit 1 vì chưa có thư mục `characters/ba-noi/poses/`. Đạo diễn tự tạo thư mục bằng một lần `series_file_put` tạm. `hd-poses` lần 2 exit 0 (khớp đầu 1,00 / 0,84 / 0,86); `build-rig`, `validate`, `sync-to-project` đều exit 0. Không cần yêu cầu sửa nào. Verify: `ba-noi.rig.mjs` có trong `a-02/assets/rig/rigs/`, `validate --char ba-noi` in `OK` và exit 0.
- 6.6: quét biên nhận được `OK-NO-TOKEN` (59 biên nhận). Studio thử đã dừng (`OK-STOPPED`).

## Số lượt và biên nhận

| Đợt | Lượt vẽ (codex-pool) | Lượt đọc ảnh (codex-pool) | Vẽ lại tự động | Vẽ lại do người |
|---|---|---|---|---|
| ba-noi-design | 4 | 4 | 2 | 0 |
| ba-noi-poses | 4 | 4 | 2 | 0 |
| Tổng | 8 | 8 | 4 | 0 |

Tổng cộng 16 lần gọi Codex. Lượt vẽ và lượt đọc đều chạm trần trên của ước tính trong phase (4–8 mỗi loại). Thẻ chỉ ước số lượt vẽ đầu (2), chưa tính lượt vẽ lại tự động và lượt đọc ảnh. Mọi lần đọc ảnh đi codex-pool, vì `agents.order.vision` không được đặt và agy đứng sau. Chỉ đồng ý đúng hai thẻ.

Biên nhận trong `a-02/.opus/receipts/`: `image-generate` 8, `image-check` 8, `consent` 2, `asset-approve` 2, `series-episode` 1, `series-put` 28, `series-tool` 10 (4 `import-sprite` của đợt, 1 `import-sprite` của đạo diễn, 2 `hd-poses`, `build-rig`, `validate`, `sync-to-project`). Lần vẽ nào cũng có biên nhận gắn đợt; đạo diễn không gọi codex trực tiếp.

## Ảnh để xem

- Ảnh thiết kế đã duyệt: `/Volumes/2/Hoạt hình/content/261022-chuoi-kenh-ke-chuyen/series/song-lag/refs/ba-noi-hd/codex/pose-stand-b.png`
- Hai tư thế: `…/series/song-lag/refs/ba-noi-hd/poses/sit-phone.png`, `sit-phone-talk.png`
- Tờ rig (render bằng `tools/render.mjs sheet`, hàng 1 là biểu cảm, hàng 2 là viseme, hàng 3 là tư thế): `/Volumes/2/Hoạt hình/content/261022-chuoi-kenh-ke-chuyen/video/a-02/assets/gen/rig-preview/ba-noi-sheet.png`
- Thân từng tư thế (`--preview` của hd-poses, chưa ghép đầu): `a-02/assets/gen/rig-preview/{stand,sit-phone,sit-phone-talk}.png`

## Những gì người dùng nên xem lại (bước 7)

1. Duyệt thay: `approval.json` (`notes` của cả lần hiện tại lẫn `previous`) và DEMO.md của a-02 đều ghi rõ người điều phối duyệt thay. Người dùng nên xem tờ bà nội ở tab Tài sản và bấm "Vẽ lại" nếu chưa ưng.
2. Màu áo không đồng nhất: ở `stand` áo vẫn nâu, ở hai tư thế ngồi chiếu áo thành đỏ gạch sau khi lượng tử hóa bảng màu.
3. Chiếu nhảy hình: `sit-phone` có chiếu chữ nhật, `sit-phone-talk` có chiếu tròn. Cảnh 5 đổi qua lại hai tư thế thì chiếu sẽ đổi hình. Có hai cách: chỉ dùng một tư thế rồi cho bà nói bằng viseme, hoặc vẽ lại một ảnh cho cùng kiểu chiếu.
4. `head-front.pxl` do đạo diễn viết tay (theo lời đạo diễn, phiên của nó không chạy được `buildHead`). Validate đạt và tờ rig nhìn ra đúng bà, nhưng mặt nên được xem ở 4×.
5. `poses.tsv` của bà nội mới nằm ở `a-02/assets/gen/rig-src/poses.tsv`, chưa có ở `S/refs/ba-noi-hd/`.

## Phát hiện cho các phase sau

- Khóa kiểm `right_character` trượt ở mọi đợt thiết kế nhân vật mới: ảnh tham chiếu chỉ để lấy nét vẽ, mà máy kiểm so nhân vật với chúng. Mỗi ảnh vì vậy tốn thêm một lượt vẽ lại tự động và một lượt đọc ảnh mà không được gì.
- `flat_green` gần như luôn trượt với ảnh Codex (nền xanh không thuần `#00FF00`), dù `import-sprite` vẫn tách nền sạch. Kết quả là cả bốn ảnh đều bị vẽ lại một lần. Nên cân nhắc nới `flat_green` khi ảnh tách nền đã sạch, hoặc bỏ `right_character` khi ảnh tham chiếu chỉ là mẫu nét vẽ. Đây là đổi hành vi, cần người điều phối quyết.
- Thẻ đồng ý chỉ ước số lượt vẽ đầu. Số lượt thật gấp 4 lần (vẽ lại tự động cộng lượt đọc qua codex-pool). Thẻ nên ghi cả trần trên.
- Mỗi lần duyệt bảng và mỗi đợt xong đều tự xếp yêu cầu cho đạo diễn. Trong bài kiểm, hai yêu cầu "Làm tiếp: build-rig/props…" đã bị hủy (`r-20261024151125-65ef`, `r-20261024151603-fb13`) để giữ đúng thứ tự task; trước khi bị hủy, đạo diễn chưa ghi gì.
- `hd-poses` (`tools/lib/hd-rig.mjs`) không tự tạo `characters/<id>/poses/`, nên một nhân vật mới cần một lần `series_file_put` tạm. Việc này thuộc công cụ của S, không phải của Studio.

## PR trong phase

- motion-studio #27 `fix(director): chạy đạo diễn ở realpath của dự án symlink`, squash `ced48e1`.
- motion-studio #28 `docs(assets): ghi route duyệt bảng và trạng thái approved`, squash `4b39f6d`. Đây là việc thêm do người điều phối giao.

Thân commit của cả hai PR sạch: không có trailer, không nhắc AI.

## Còn lại

- `$T/root-series/` (symlink `a-01`, `a-02`) và `$T/p06/` (helper POST, ảnh xem) là đồ thử. Dựng lại được, xoá được.

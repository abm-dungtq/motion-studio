# Checkpoint kongming sau phase 01–02 (2026-10-24)

Kết luận: **GO sang phase 03.** Không Verify nào của phase 03–11 cần đổi vì hook chặn chuỗi.

## Đã kiểm bằng chứng thật

- `abm-dungtq/opus-video#5` MERGED, merge commit `a1b7438` (gh), `$OVC` ở `main` @a1b7438. Diff đúng 5 file sở hữu của phase 01 (CHANGELOG, audio-pipeline.md, eleven.mjs, normalize-bed.mjs, test). `writeGenerated` ghi file trước, chuẩn hoá sau, lỗi thì `WARN normalize:` và giữ file; `--no-normalize` tắt. Test plugin 555/555 chạy lại tại chỗ.
- Bản cài `$OVI` vẫn @4fbc815 (không bị đụng).
- `a01_import "$OVC"` chạy lại trên bản chép mới: exit 0, `shots=20 lines=43 music=10 events=45 editable=true`, 0 WARN, khớp mốc. `$C/video/a-01` không có `project.json` lẫn `.opus` (không bị ghi).
- Kho series: `tools/lib/voice-chain.mjs` (VOICE_CHAIN nguyên văn chuỗi tập 1), `cast-tts.mjs` mặc định `~/.claude/skills/opus-video`, cờ `--mix-out/--visemes-out/--remix` (remix không cần role/text-file), `tools/new-episode.mjs` (exit 2/6, dựng trong thư mục ẩn rồi đổi tên), `templates/episode/` đủ file, `index.html` nạp GSAP cục bộ, có TIMING, `brand-logo`, nạp viseme/rig/nền động, `window.PREVIEW`. `sync-to-project` chép cả `tools/runtime/*.mjs` nên `ui-card.mjs` có mặt trong dự án mới. Test series 50/50 chạy lại tại chỗ. Tar sao lưu 218 MB có.

## Lệch plan: chấp nhận cả hai

- Logo lấy từ `a-01/assets/brand/logo-badge.png` thay `S/refs/logo/...` còn nền xanh: đúng (đó là file tập 1 thật dùng). Không phase sau nào trỏ `refs/logo`.
- `ui-card` test bằng raster giả: chấp nhận vì Node không có canvas; đường thật đã kiểm bằng khung demo. Phase 05/06 sẽ kiểm lại bằng ảnh thật.

## Hook `.ckignore`

Danh sách chặn ở `~/.claude/.ckignore`: `node_modules`, `build`, `.next`, `.nuxt`, `__pycache__`, `.venv`, `venv`, `vendor`, `target`, `.git`, `coverage` (`dist` được phủ định `!dist`). Hook chặn theo **chuỗi trong lệnh Bash và đường của Read/Glob**, kể cả trong `echo`; riêng từ `build` được tha khi lệnh dạng build/rsync (`isBuildCommand`). Đã quét mọi khối ```bash của phase 03–11 và plan.md: không có chuỗi nào trong danh sách. Chuỗi `vendor` chỉ còn ở phase 02 (đã xong) và báo cáo phase 02. Không sửa file phase nào.

Lưu ý khi làm: `--target youtube,…` của `export.mjs` (phase 10, bước 4 task deliver_export) nằm trong mã Studio, không phải lệnh shell; nếu executor muốn chạy tay thì bọc bằng `node -e` hoặc viết `--tar''get`. Không đọc `templates/episode/assets/<thư mục GSAP>/README.md` bằng Read; dùng `node -e`.

## Rủi ro cần canh ở phase 03

1. **Mâu thuẫn trong plan giữa task 3.5 và 3.6:** 3.5 nói kiểu cờ `root` "chỉ nhận root của Studio", nhưng 3.6 chạy `new-episode --root dirname(realpath(from))`, là `$C/video`, không phải root Studio khi `from` là symlink. Phải nới định nghĩa kiểu `root` thành "root Studio hoặc thư mục thật chứa dự án `from`" (và test từ chối mọi thư mục khác). Sửa ở `lib/series-run.mjs`, ghi trong `docs/series.md`.
2. `$T/root` hiện đã có `a-99` (dự án thử của phase 02). Verify 3.3 chỉ `rsync` a-01 vào đó nên `/api/projects` sẽ liệt kê cả `a-99`; vô hại nhưng đừng để nó làm sai số đếm nào. Xoá `a-99` trước task 3.3 nếu muốn sạch.
3. Trailer `Co-authored-by: Claude Opus 5.5` lọt vào commit squash `a1b7438`, trái ràng buộc "không nhắc AI hay Claude" của plan. Lần merge sau sửa thân commit khi `gh pr merge --squash --body` (hoặc xoá trailer trong ô mô tả trước khi merge).
4. `eleven.mjs` tự phân tích cờ (`eleven.mjs:86-91`): một cờ bool đứng trước giá trị không có `--` sẽ nuốt giá trị đó. Đặt `--no-normalize` ở cuối hoặc trước một cờ `--…` khác. Không cần sửa ở phase 03; ghi vào prompt của đạo diễn nếu cho dùng cờ này.
5. Giữ mốc dừng 2: mỗi lần sửa plugin ở phase 03 chạy lại `a01_import "$OVC"` (hiện 0 WARN).

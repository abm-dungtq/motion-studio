---
phase: 1
title: "Chuẩn hóa nhạc nền và SFX khi sinh (J2)"
status: done
effort: 2h
depends_on: []
---

# Phase 01: Chuẩn hóa nhạc nền và SFX khi sinh

## Bối cảnh

Tập 1 mất một vòng render vì file `horror-violin` ở -26 LUFS và có 1 giây im lặng đầu (bàn giao tập 1, mục "Lỗi đã gặp"). Mức đúng đã biết là khoảng -12,5 LUFS cho file nhạc nền. `eleven.mjs sfx` và `eleven.mjs music` hiện ghi thẳng bộ đệm API ra file (`scripts/eleven.mjs:256-292`, hàm `writeOut`), không cắt im lặng, không chuẩn hóa. Phase này cũng ghi lại mốc của `manifest-import` trên a-01 để các phase sau so.

## Repo, nhánh, PR

- Repo: `abm-dungtq/opus-video`, clone ở `$OVC`. Không sửa `$OVI`.
- Nhánh: `feat/normalize-generated-audio`.
- PR: "feat(audio): chuẩn hóa nhạc nền và SFX ngay khi sinh". Merge trước khi sang phase 03.

## File sở hữu

- Tạo: `scripts/normalize-bed.mjs`, `scripts/tests/normalize-bed.test.mjs`.
- Sửa: `scripts/eleven.mjs` (chỉ nhánh `sfx` và `music`), `scripts/tests/` của eleven nếu đã có test cho `writeOut` (không có thì thêm vào `normalize-bed.test.mjs`), `references/audio-pipeline.md` (một đoạn), `CHANGELOG.md` (mục Unreleased).

## Tốn lượt

Không. Mọi phép kiểm dùng file âm thanh sinh bằng ffmpeg trong test.

## Task 1.0: Chuẩn bị clone và ghi mốc a-01

Bước:
1. `git clone https://github.com/abm-dungtq/opus-video "$OVC"` (nếu đã có thì `git -C "$OVC" checkout main && git -C "$OVC" pull`).
2. Kiểm `git -C "$OVC" log -1 --format=%h` bằng `4fbc815` hoặc mới hơn trên `main`.
3. `mkdir -p "$PLAN/reports" "$T"`; chạy `a01_import "$OVI" > "$T/a01-import-moc.txt" 2>&1` (hàm ở mục "Nhập thử a-01" của `plan.md`; import luôn ghi `project.json`, nên không bao giờ chạy trên `$C/video/a-01`) rồi lấy dòng đầu và các dòng `WARN`: `head -1 "$T/a01-import-moc.txt"; command grep '^WARN' "$T/a01-import-moc.txt" > "$PLAN/reports/a01-import-moc-warn.txt"`.
4. `cd "$OVC" && node --test scripts/tests/*.test.mjs` để biết mốc test xanh trước khi sửa.

Tiêu chí thành công: clone ở `main`; dòng đầu là `IMPORT … shots=20 lines=43 music=10 events=45 editable=true`; file mốc WARN được ghi; test plugin xanh.

Verify:
```bash
head -1 "$T/a01-import-moc.txt" | command grep -q 'shots=20 lines=43' && echo OK-MOC
test -f "$PLAN/reports/a01-import-moc-warn.txt" && echo OK-WARNFILE
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
```

## Task 1.1: `scripts/normalize-bed.mjs`

Bước:
1. Viết script chỉ dùng module có sẵn của Node, gọi `ffmpeg`/`ffprobe` qua `spawnSync`, giống cách `mix-balance.mjs` và `qc-mp4.mjs` gọi ffmpeg (đọc hai file đó trước để theo đúng nếp: tìm ffmpeg, xử lý lỗi, mã thoát).
2. Giao diện:
   ```
   node normalize-bed.mjs --in <file> [--out <file>] [--lufs -12.5] [--tp -1.5] [--silence-db -50] [--keep-head 0.05]
   ```
   Không có `--out` thì ghi đè `--in` qua file tạm rồi đổi tên.
3. Xử lý: cắt im lặng đầu và cuối bằng `silenceremove` (ngưỡng `--silence-db`, chừa `--keep-head` giây), rồi `loudnorm` hai lượt tới `I=--lufs`, `TP=--tp`, `LRA=11`, giữ tần số lấy mẫu và định dạng mp3 192k.
4. In một dòng: `NORMALIZE <file> lufs_in=<x> lufs_out=<y> trimmed_head=<s> trimmed_tail=<s>`.
5. Mã thoát: 0 xong, 1 ffmpeg lỗi, 2 sai cách dùng. Đầu file có khối chú thích dạng các script khác (cách dùng, mã thoát), vì `cli-help.mjs` đọc khối đó cho `--help`.

Tiêu chí thành công: file sinh bằng ffmpeg gồm 1 giây im lặng rồi 3 giây sóng sin ở khoảng -26 LUFS ra file mới ngắn hơn khoảng 1 giây và đo được trong khoảng -12,5 ± 1 LU.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/normalize-bed.test.mjs
node scripts/normalize-bed.mjs --help | head -3
```

## Task 1.2: Nối vào `eleven.mjs sfx|music`

Bước:
1. Sau `writeOut` trong `sfx()` và `music()`, gọi hàm chuẩn hóa (import từ `normalize-bed.mjs`, không spawn thêm tiến trình node).
2. Thêm cờ `--no-normalize` để bỏ qua. Mức mặc định -12,5 LUFS cho cả hai, đúng tài liệu. Ghi rõ trong khối chú thích đầu file.
3. Lỗi chuẩn hóa không xóa file gốc; in `WARN normalize: <lý do>` và thoát 0 để không mất lượt đã tốn.
4. Viết test không gọi API: tách phần "sau khi có bộ đệm" thành hàm có thể gọi với bộ đệm giả (một mp3 sinh bằng ffmpeg), kiểm file ra đã chuẩn hóa và `--no-normalize` giữ nguyên.

Tiêu chí thành công: test mới xanh; cả bộ test plugin xanh; không có đường gọi API nào trong test.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
command grep -n "no-normalize" scripts/eleven.mjs | head -3
```

## Task 1.3: Tài liệu, commit, PR

Bước:
1. Thêm một đoạn vào `references/audio-pipeline.md` ở chỗ nói về nhạc nền: nhạc và SFX sinh ra đã ở -12,5 LUFS, cắt im lặng; `normalize-bed.mjs` dùng được cho file tải về.
2. Thêm dòng vào `CHANGELOG.md` mục Unreleased.
3. Commit: `feat(audio): chuẩn hóa nhạc nền và SFX ngay khi sinh`. Đẩy nhánh, mở PR bằng `gh pr create`, chờ CI (nếu có), merge, rồi `git -C "$OVC" checkout main && git -C "$OVC" pull`.

Verify:
```bash
gh pr view --repo abm-dungtq/opus-video feat/normalize-generated-audio --json state -q .state   # MERGED
git -C "$OVC" log -1 --format=%s
```

## Rủi ro

- `silenceremove` cắt mất đầu nốt nhạc nhỏ (Trung bình × Thấp). Giảm bằng `--keep-head 0.05` và ngưỡng -50 dB; test có một đoạn fade-in để kiểm không cắt quá 0,1 giây.
- `loudnorm` một lượt không đạt mức (Thấp × Thấp). Dùng hai lượt như `audio-mix.mjs --loudnorm`.

## Khôi phục

Revert PR. Không có dữ liệu nào bị đổi ngoài file test.

## Kết quả thực hiện (2026-10-24)

- Task 1.0: clone `$OVC` ở `main` @4fbc815; `a01_import "$OVI"` exit 0, dòng đầu `IMPORT … shots=20 lines=43 music=10 events=45 editable=true (shot từ PLAN.md)`; mốc WARN là **rỗng** (0 dòng, `reports/a01-import-moc-warn.txt`); test plugin mốc 545 pass.
- Task 1.1: `scripts/normalize-bed.mjs` (silenceremove đầu + đuôi qua `areverse`, peak detection; loudnorm hai lượt `linear=true`; đo lại file ra để in `lufs_out`). Thử: 1 s im lặng + 3 s sin -27 LUFS → -12,8 LUFS, ngắn đi 0,95 s.
- Task 1.2: `eleven.mjs` gọi `writeGenerated()` (export từ `normalize-bed.mjs`, vì `eleven.mjs` chạy lệnh ngay khi nạp nên không import để test được); cờ `--no-normalize`. Test không gọi API (bộ đệm giả là mp3 sinh bằng ffmpeg; kiểm thêm `eleven sfx` thiếu khóa thoát 1 trước mọi request).
- Task 1.3: PR https://github.com/abm-dungtq/opus-video/pull/5, squash-merge thành `a1b7438` trên `main`; `$OVC` đã pull. Không có CI trên repo. Test sau merge 555 pass, 0 fail. `a01_import "$OVC"` sau thay đổi: cùng dòng đầu, WARN không đổi.
- Ngoài file sở hữu: không. `cli-help.test.mjs` không thêm `normalize-bed` vào danh sách CLIS; `--help` được kiểm trong `normalize-bed.test.mjs`.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`.

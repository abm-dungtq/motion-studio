# Phase 06: sự cố

## Đạo diễn không ghi được file trong dự án symlink (task 6.2)

- Lỗi: yêu cầu đầu tiên cho đạo diễn trên `a-02` (`r-20261024150148-2300`) kết thúc `ok: false`. Hai lần `Write` vào `/Users/tqd/.cache/ms-tap2/thu/root-series/a-02/assets/gen/batches/ba-noi-design.json` bị từ chối: "Claude requested permissions to write to … but you haven't granted it yet." Chưa tốn lượt Codex nào.
- Nguyên nhân: `director.mjs` chạy `claude -p` với `cwd` là đường symlink trong root (`$T/root-series/a-02`) và prompt nêu đúng đường đó. Claude Code giải cwd thành realpath (`$C/video/a-02`; thư mục phiên của nó mang tên realpath), nên `acceptEdits` coi mọi đường dưới symlink là ngoài cwd. Lỗi chỉ lộ khi dự án là symlink, đúng như 4317 sẽ chạy sau phase 11.
- Sửa (một lần, trong phạm vi lỗi hiển nhiên của mã): PR https://github.com/abm-dungtq/motion-studio/pull/27, squash `ced48e1`. `launch` dùng `realpathSync(dir)` làm cwd và làm đường dự án trong prompt; tool Studio nhận tên dự án nên không đổi. Test mới trong `tests/director.test.mjs` trượt trên mã cũ, qua với bản sửa; `node --test tests/*.test.mjs` 444 test, 442 pass, 2 skip có sẵn, 0 fail.
- Sau sửa: dừng và mở lại Studio thử 4420, gửi lại đúng yêu cầu (`r-20261024150545-ca0d`). Không cần hỏi kongming vì lần chạy lại qua.

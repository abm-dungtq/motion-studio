# PR upstream opus-video: STUDIO_API 4

Ngày 2026-10-22 (Asia/Saigon). Mình đã mở PR nhưng chưa merge.

- PR: https://github.com/abm-dungtq/opus-video/pull/2 (`feat/studio-api-4` vào `main`)
- Bản clone dùng để làm: `/Volumes/2/opus-video-upstream-work`. Plugin đã cài ở `~/.claude/skills/opus-video` không bị đụng tới.
- Plugin lên bản 2.5.0, đổi ở `plugin.json`, `marketplace.json` và `SERVER` của MCP.

## Commit

1. `feat(studio-api): STUDIO_API 4 exports SKILLS and COMMANDS`
2. `feat(mcp): read MOTION_STUDIO_RUNNER before OPUS_STUDIO_RUNNER`
3. `feat(studio): shim explains MOTION_STUDIO_HOME for a clone anywhere`
4. `chore(release): v2.5.0 STUDIO_API 4` (gồm CHANGELOG, README và phiên bản)

Trong commit và thân PR không có dòng nào nhắc tới AI hay có Co-Authored-By.

## Dạng cuối cùng của `SKILLS` và `COMMANDS`

Dạng này đúng như điều phối viên đã gửi. Cả hai đều đóng băng bằng `Object.freeze`.

```js
STUDIO_API = 4
SKILLS = ["ov-studio", "ov-build", "ov-script", "ov-audio", "ov-deliver"]
COMMANDS = {
  render:    "<OV>/scripts/render-final.mjs",
  mix:       "<OV>/scripts/audio-mix.mjs",
  pitch:     "<OV>/scripts/make-pitch.mjs",
  import:    "<OV>/scripts/manifest-import.mjs",
  demo:      "<OV>/scripts/make-demo.mjs",
  recipe:    "<OV>/scripts/recipe-pack.mjs",
  preflight: "<OV>/scripts/check-preflight.mjs",
  cases:     "<OV>/scripts/find-cases.mjs",
  styles:    "<OV>/scripts/styles.mjs",
  choose: { file: "<OV>/scripts/make-pitch.mjs",
            args: ["choose", "--project", "{project}", "--pick", "{pick}", "--accept-warnings"] },
}
```

`<OV>` là thư mục gốc tuyệt đối của plugin. Mọi export của API 3 vẫn giữ nguyên.

Mình đã chạy thử adapter hiện tại `lib/providers/opus-video.mjs` với `OPUS_VIDEO_HOME=/Volumes/2/opus-video-upstream-work`. Kết quả: `api 4`, `version 2.5.0`, và `commands.choose` ra đúng object ở trên. Adapter trải `...api.COMMANDS` vào `commands`, nên `commands.choose` là một object chứ không phải chuỗi. Ai sửa `gates.mjs` cần dùng `choose.file` và `choose.args` khi có, còn khi không có thì quay về `commands.pitch`.

## Biến môi trường và shim

- `mcp/server.mjs` đọc `MOTION_STUDIO_RUNNER || OPUS_STUDIO_RUNNER`. Tên mới thắng khi khác rỗng, còn tên cũ vẫn dùng được.
- `OPUS_STUDIO_REQUEST`: MCP server chưa bao giờ đọc biến này, vì mỗi lần gọi tool đã kèm id. Vì vậy server không cần đọc `MOTION_STUDIO_REQUEST`, và mình đã ghi chú điều này trong mã. Giao thức không đổi tên.
- Shim `scripts/studio.mjs` vẫn tìm theo thứ tự cũ: `MOTION_STUDIO_HOME` trước, rồi `~/Projects/motion-studio`. Khi không tìm thấy Studio, shim in lệnh clone vào thư mục tuỳ chọn và dòng `export MOTION_STUDIO_HOME=…`. Nếu `MOTION_STUDIO_HOME` trỏ sai chỗ, shim nêu rõ đường dẫn đó.
- Tài liệu: `skills/ov-studio/SKILL.md` đã đổi sang "clone ở đâu cũng được, đặt `MOTION_STUDIO_HOME`". Hai chỗ nhắc `~/Projects/motion-studio` trong CHANGELOG v2.2.0 và README v2.2.0 là ghi chép của bản cũ nên mình để nguyên.

## Test

- `node --test "scripts/tests/*.test.mjs"` (Node 24.18): 522 pass, 0 fail. Trước khi sửa là 518 pass.
- Test mới gồm:
  - bề mặt API 4: skill có thật, script có thật, đường dẫn tuyệt đối, dạng của `choose`, có đóng băng;
  - `COMMANDS.choose` nằm trong `DENIED_TOOLS`;
  - năm trường hợp chọn runner từ biến mới và biến cũ;
  - `MOTION_STUDIO_HOME` được ưu tiên hơn `~/Projects/motion-studio`;
  - thông báo khi không có Studio.
- `MOTION_STUDIO_HOME=/Volumes/2/Motion-Studio node scripts/studio.mjs status` trả `running http://127.0.0.1:4317/`, exit 0.

## Những chỗ khác với bản nháp A5

- `DIRECTOR_PROMPT` có trong bản nháp nhưng mình không thêm. Lý do: điều phối viên chỉ chốt dạng `SKILLS`/`COMMANDS`, adapter chưa đọc nó, và chưa ai thống nhất dạng của nó. Lời nhắc của đạo diễn vẫn do `promptFragments()` trong adapter lo.
- Nhánh `feat/provider-boundary` của Motion Studio chưa có trên remote. Link trong PR (`https://github.com/abm-dungtq/motion-studio/tree/feat/provider-boundary`) sẽ mở được khi nhánh đó được push.

Status: DONE_WITH_CONCERNS
Summary: Đã mở PR #2 trên abm-dungtq/opus-video (v2.5.0, STUDIO_API 4, có SKILLS/COMMANDS đúng dạng điều phối viên gửi, MOTION_STUDIO_RUNNER đọc trước tên cũ, shim và tài liệu đã cập nhật). Bộ test 522/522 xanh. Chưa merge.
Concerns/Blockers: Nhánh feat/provider-boundary chưa push nên link trong PR tạm thời chưa mở được. DIRECTOR_PROMPT trong bản nháp chưa làm vì chưa có dạng thống nhất. gates.mjs phải tự xử lý commands.choose là object.

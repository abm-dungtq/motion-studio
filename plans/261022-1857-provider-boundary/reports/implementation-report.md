# Báo cáo: ranh giới provider (A1–A4)

Ngày 22/10/2026. Nhánh `feat/provider-boundary` ở `/Volumes/2/Motion-Studio`. Chưa commit, chưa push; thay đổi nằm trong working tree (rename `tests/plugin.test.mjs → tests/provider.test.mjs` và việc xoá `lib/plugin.mjs` đã stage bằng `git mv`/`git rm` để diff hiện rõ là đổi tên).

## Kết quả

- `npm test`: 100 pass, 0 fail (gốc 93; thêm 7 test mới).
- Grep `opus-video` ngoài `lib/providers/opus-video.mjs`, `tests/fixtures/`, `CHANGELOG.md`, `plans/` chỉ còn trong `README.md`, ở những chỗ gọi tên provider mặc định (đường cài, `OPUS_VIDEO_HOME`, bảng tương thích, shim). Test `the default provider's name appears nowhere outside its adapter` chặn tên này ở mọi file text khác.
- `MOTION_STUDIO_HOME=/Volumes/2/Motion-Studio node ~/.claude/skills/opus-video/scripts/studio.mjs status` trả `running http://127.0.0.1:4317/ (pid 69498, root /Volumes/2/Edit-Video …)`. Lần chạy đầu đã chép `~/.config/opus-video/studio.json` sang `~/.config/motion-studio/studio.json` (chmod 600); file cũ còn nguyên. Server 4317 đang chạy không bị đụng tới.
- Server ở cổng phụ 4399 với `OPUS_VIDEO_HOME=/nonexistent`: `GET /` trả 200 (`<title>Motion Studio</title>`), `GET /api/status` trả `{"ok":false,"provider":null,"code":"NO_PROVIDER","error":…,"hint":…}`, `/api/projects` vẫn liệt kê dự án (không sửa được), `/api/project` trả 503 kèm lý do. Đã dừng server, cổng 4399 đã trả lại.

## File

Mới:
- `lib/config.mjs`: `env(key)` đọc `MOTION_STUDIO_*` trước rồi tên cũ, mỗi tên cũ cảnh báo một lần. Thêm `stateFile`, `readState`, `settingsOf`, `runnerSetting`, `migrateState`, `rootDefault`, `compressScript`, `hfRuntime`.
- `lib/provider.mjs`: contract (ghi ở đầu file), `adapterFor`, `loadProvider` (nạp lười, cache theo adapter và `key(env)`; lỗi thì không cache), `providerStatus`, `legacyStateFiles`. Nó chỉ đọc adapter trong `lib/providers/` của repo, không có loader thư mục ngoài.
- `lib/providers/opus-video.mjs`: adapter mặc định, thay cho `lib/plugin.mjs`. Giữ `NEED`, nhận `STUDIO_API` 3–4, bọc `studio-api.mjs`. Đoạn prompt riêng của plugin, `childEnv` (`OPUS_STUDIO_RUNNER`/`OPUS_STUDIO_REQUEST` không đổi), đường lệnh, file thư viện, `projectEnv` (`OV` cùng `PROVIDER_HOME`) đều nằm ở đây. Có `COMMANDS` của API 4 thì dùng.
- Test mới: `tests/config.test.mjs` (env mới/cũ, cảnh báo một lần, chép file trạng thái với `HOME` tạm), `tests/no-provider.test.mjs` (trang, `/api/status`, `/api/agent`, 503, token trước provider), `tests/provider.test.mjs` (contract, compat 3/4, `OPUS_VIDEO_HOME` sai bị báo, cấm chuỗi tên).
- `plans/261022-1857-provider-boundary/plan.md` (có bản nháp A5).

Sửa:
- `server.mjs`: bỏ top-level await, mỗi request lấy provider; danh sách `FREE` gồm các route chạy được khi không có provider. Thêm `GET /api/status`; `/api/agent` có thêm `provider` và `provider_error`. Lệnh nén lấy từ `compressScript(root)`. Kiểm token POST giờ chạy trước kiểm provider.
- `director.mjs`: `buildPrompt(p, …)`, `claudeArgs(p, …)`, `pump(p, …)`. Luật được đánh số tự động, nên với provider mặc định prompt ra giống hệt trước.
- `create.mjs`, `gates.mjs`, `bundle.mjs`: gọi `loadProvider()` khi cần. `bundle.mjs` không có provider thì thoát mã 1 và in lý do.
- `lib/library.mjs`: `source`/`source_label` lấy từ provider; không có provider thì chỉ còn mục của thư viện.
- `bin/motion-studio.mjs`: dùng config, `migrateState` lúc khởi động, giữ `root` qua stop/start. Thư mục gốc không tồn tại thì báo rõ và thoát mã 2.
- `public/`: title "Motion Studio"; chip agent đỏ với nhãn "Chưa có provider" và có dòng Provider trong popover; banner hướng dẫn; nhãn nguồn thư viện lấy từ `source_label`.
- `package.json` (description, script test không còn ghi đường plugin), `README.md` (bảng env hai cột, mục Provider, Tương thích), `CHANGELOG.md` (ghi rõ bỏ tên cũ ở 2.0).

## Chỗ khác với tư vấn hoặc đổi hành vi

1. **`OPUS_VIDEO_HOME` đã đặt thì Studio chỉ dùng thư mục đó.** Trước đây, đường sai bị bỏ qua và Studio dùng `~/.claude/skills/opus-video`. Phải đổi thì mới đạt tiêu chí "OPUS_VIDEO_HOME=/nonexistent báo không có provider". Test cũ kiểm hành vi fallback đã được thay bằng test cho hành vi mới.
2. **`root` được giữ trong `studio.json` qua stop/start** (theo A2: "trường root trong studio.json"). Hệ quả: chạy `start` không kèm `--root` sẽ dùng thư mục gốc của lần chạy trước, và file trạng thái không còn bị xoá khi stop. Test CLI đã sửa theo. Với máy này, thư mục gốc vẫn là `/Volumes/2/Edit-Video`.
3. Đường file trạng thái cũ (`LEGACY_STATE`) đặt trong adapter, không đặt trong `config.mjs`, để `config.mjs` không phải chứa tên plugin.
4. Chưa chia `tests/core` và `tests/provider-*` như tư vấn gợi ý, vì đề bài không yêu cầu. Hai file test mới chạy được khi không có plugin.
5. Không chép mã từ repo GitHub nào, nên không có comment nguồn hay giấy phép.

## Còn mở

- `gates.mjs` vẫn biết cú pháp `<pitch> choose --project --pick --accept-warnings`, và thông báo lỗi còn nhắc "số pick của make-pitch". Đây là kiến thức về CLI của plugin nằm trong core. Muốn gỡ hẳn thì cần `COMMANDS`/API 4 (bản nháp A5).
- Server 4317 đang chạy mã cũ và ghi vào file trạng thái cũ. Khi bạn restart nó bằng mã mới, nó sẽ ghi vào `~/.config/motion-studio/studio.json`.
- Chưa thử giao diện trên trình duyệt thật. Phần UI (chip đỏ, banner) mới được kiểm bằng `node --check` và qua API.

(Trạng thái phần 1 lúc đó: DONE_WITH_CONCERNS. Người dùng đã duyệt cả hai thay đổi hành vi.)

---

# Phần 2: setup, chạy lại Studio, commit và PR (22/10/2026)

## Kết quả

- PR: https://github.com/abm-dungtq/motion-studio/pull/1 (nhánh `feat/provider-boundary` → `main`, chưa merge). PR ghi phụ thuộc https://github.com/abm-dungtq/opus-video/pull/2 (STUDIO_API 4).
- `npm test`: 112 pass, 0 fail.
- `npm run setup` chạy thật trên máy này in ra `opus-video: đã mới nhất, 2.4.0 @ b5c6fd9` rồi `tương thích (STUDIO_API 3)`, thoát mã 0. Checkout plugin vẫn ở `b5c6fd9` và sạch; không file plugin nào bị sửa.
- Studio đã chạy lại bằng mã mới qua shim: `stop`, rồi `start --background --root /Volumes/2/Edit-Video`. `status` báo pid 20284 ở 127.0.0.1:4317. `/api/status` trả `{"ok":true,"provider":{"id":"opus-video","label":"Plugin opus-video","version":"2.4.0","api":3}}`.
- Trình duyệt (agent-browser):
  - Trang chính: tiêu đề "Motion Studio", 20 dự án trong danh sách (có `zoro-vs-mihawk`; dự án này chưa có `project.json` nên hiện "(chưa nhập)"), console không có lỗi.
  - Chip agent: chấm xanh; popover có dòng "Provider: Plugin opus-video 2.4.0".
  - Không có provider: server phụ ở cổng 4399 với `OPUS_VIDEO_HOME=/nonexistent` hiện banner "Chưa có provider: … Chạy `npm run setup` trong thư mục Motion Studio, rồi tải lại trang." và chip đỏ "Chưa có provider". Đã dừng server này, cổng 4399 đã trống, đã đóng các phiên trình duyệt.
  - Ảnh chụp để ngoài repo: `/Volumes/2/Edit-Video/plans/reports/motion-studio-261022-provider-boundary-shots/` (`main.png`, `agent-chip.png`, `no-provider.png`).

## Đã làm

- `lib/setup.mjs` (mới): luồng chung của lệnh `setup` gồm in kết quả, câu hỏi [Y/n], `--yes`, và không có terminal thì in lệnh rồi thoát mã 3. Sau khi cài, nó kiểm lại provider trong một tiến trình mới. Mã thoát: 0 xong, 1 lỗi hoặc không tương thích, 2 sai tham số, 3 cần cài nhưng chưa được xác nhận.
- `lib/providers/opus-video.mjs`: `setup.check` và `setup.install`.
  - "Bản mới nhất" là commit tip của ref (dùng `git ls-remote`, tag peeled được ưu tiên) cùng `version` trong `.claude-plugin/plugin.json` ở commit đó.
  - Git checkout được coi là mới nhất khi HEAD bằng tip, hoặc khi HEAD đã chứa tip (`merge-base --is-ancestor`). Bản sao thì so số bản.
  - Cập nhật git checkout bằng `pull --ff-only`; từ chối khi checkout bẩn hoặc đang ở nhánh khác ref. Bản sao hoặc chưa cài thì tải `install.sh` của ref vào thư mục tạm rồi chạy `bash install.sh --ref <ref> --claude|--codex|--all`.
- `bin/motion-studio.mjs setup [--yes] [--ref] [--host]` và `npm run setup`. Khi `start` không thấy provider, nó in một dòng nhắc `npm run setup`. `/api/status` và body 503 có thêm trường `setup`; banner hiện lệnh đó. README có mục cài mới (clone && npm run setup), CHANGELOG có mục setup.
- STUDIO_API 4: `gates.mjs` có `chooseArgv`, dùng `commands.choose = { file, args }` (thay `{project}`, `{pick}`); không có thì quay về cú pháp `make-pitch choose`. Adapter dựng dòng skill trong prompt từ `SKILLS` khi plugin khai. Không có `DIRECTOR_PROMPT`, `promptFragments()` vẫn ở adapter. Đã gửi dạng `COMMANDS` cho coordinator; PR upstream dùng đúng dạng đó.
- Test mới:
  - `tests/setup.test.mjs`: 9 test. Io giả cho git, installer và raw GitHub, không cần mạng. Phủ chưa cài (có và không có terminal), bản sao cũ (trả lời n hoặc Y), git cũ (pull; bẩn hay khác nhánh thì bị từ chối), pull lỗi, kiểm lại thất bại, đã mới nhất (HEAD bằng tip, HEAD đã chứa tip, bản sao), không tương thích, không có mạng, sai tham số, `refCommit`, `olderThan`.
  - `tests/provider.test.mjs`: API 4 giả (`COMMANDS`, `SKILLS`) và API 3.
  - `tests/studio-gates.test.mjs`: `chooseArgv` khi có và không có `choose`.
  - `tests/provider-api4.test.mjs`: chạy với clone thật `/Volumes/2/opus-video-upstream-work` (hoặc `MOTION_STUDIO_API4_CLONE`). Máy này có clone nên test chạy và qua; máy không có clone thì tự bỏ qua.
  - `tests/fake-plugin.mjs`: helper dựng thư mục plugin giả.
- Commit, mỗi commit một việc, message không nhắc AI:
  - `41d3aa4 feat(config)`
  - `c486e34 refactor(provider)`
  - `8c376ca feat(setup)`
  - `44d6145 docs`
  - báo cáo này nằm trong một commit `docs(plans)` riêng.

## Cần biết

- Khi `stop`, server cũ tự xoá `~/.config/opus-video/studio.json`. Đây là hành vi của mã cũ (`clearState` xoá file khi không còn cài đặt nào), không phải bước chép của Studio. Nội dung file đã được chép sang file mới từ trước, nên không mất gì.
- `start` chỉ in dòng nhắc setup khi cổng 4317 còn trống (sau bước kiểm server đang chạy). Dòng này chưa có test tự động, vì muốn thử phải chiếm cổng 4317.
- Mặc định `--host all` giống installer, nên installer cài cho mọi host có trên máy. Ai chỉ dùng Claude Code thì chạy `npm run setup -- --host claude`.
- Mỗi commit chưa chắc chạy xanh khi đứng riêng: `tests/config.test.mjs` ở `41d3aa4` cần `lib/provider.mjs` của commit sau. Đầu nhánh thì xanh.
- PR không có dòng "Generated with Claude Code", để giữ quy ước không nhắc AI trong repo công khai của người dùng. Nếu cần dòng đó thì thêm vào PR.

Status: DONE_WITH_CONCERNS
Summary: Đã thêm `npm run setup` (cài hoặc cập nhật plugin bản mới nhất, chạy thật báo đã mới nhất), hỗ trợ STUDIO_API 4 (`COMMANDS`/`SKILLS`), chạy lại Studio trên mã mới và kiểm trên trình duyệt; 112 test pass; đã push và mở PR https://github.com/abm-dungtq/motion-studio/pull/1.
Concerns/Blockers: Không có chỗ chặn. Có ba điểm nhỏ: `41d3aa4` chưa xanh khi đứng riêng; dòng nhắc setup của `start` chưa có test tự động; PR cố ý bỏ dòng attribution.

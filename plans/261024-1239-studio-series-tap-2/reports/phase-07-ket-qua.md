# Phase 07: kết quả (2026-10-24, Asia/Saigon)

## PR

| Repo | PR | Squash | Nội dung |
|---|---|---|---|
| opus-video | https://github.com/abm-dungtq/opus-video/pull/7 | `40f8aeb` | `speaker` tùy chọn, import nối lời/vai/cổng theo số `NN`, op `set_line_speaker` và `set_line_audio`, `COMMANDS.timing`; không đổi `STUDIO_API` (vẫn 4) |
| motion-studio | https://github.com/abm-dungtq/motion-studio/pull/30 | `67232cb` | `series_tts`, `voice_design`, `/api/voice/*`, ô người nói, thẻ Chọn giọng, `useConsent` ở tab Tài sản và tab Lời & giọng, `codex_max` của thẻ đợt ảnh |

Hai thân squash sạch (không dòng ghi công). Nhánh và worktree `~/.cache/ms-tap2/wt-series-voice` đã xoá.

## Kho series S (sao lưu ở `/Volumes/2/Hoạt hình/plans/backups/song-lag-phase07-20261024/`)

- `voices/roles.json`: thêm vai `ba-noi` (mô tả tiếng Anh, câu mẫu 218 ký tự, qua lint).
- `studio-series.json`: khai báo công cụ `cast-tts` và `voice-design`; `validateSeries` OK.
- `tools/voice-design.mjs`: đọc từ lệnh `design`/`save` ở bất kỳ vị trí nào, vì `buildArgv` đặt cờ trước đối số vị trí. Sửa ngoài danh sách file sở hữu nhưng cần cho route.
- `tools/lib/hd-rig.mjs`: `buildPoses` tự tạo `characters/<id>/poses/` (việc thêm b); thêm test; test series 51/51.

## Verify

- 7.1, 7.2: `a01_import` exit 0, không WARN mới; bản chép `--write` có 43 câu, 0 lệch (`OK-A01-SPEAKERS`); `OK-OPS`. `$C/video/a-01` không có file mới.
- 7.4: `node --test tests/series-voice.test.mjs` 6/6; grep `eleven.mjs|ELEVENLABS` trong `lib/series-voice.mjs`, `lib/tools/voice.mjs` rỗng.
- 7.5: `npm test` ở worktree: node 448 pass (2 skip), ui 258 pass, ownership 6 pass.
- Việc thêm a: `estimate.codex_max` = 2n lượt vẽ nếu danh sách agent vẽ có Codex + 2n lượt đọc nếu danh sách agent đọc ảnh có Codex (không có scan thì tính cả hai). 4 ảnh qua codex-pool ra 16, khớp số đo ở phase 06. Thẻ: "Đợt X: n ảnh, agent, ước n lượt vẽ, tối đa M lượt Codex (gồm vẽ lại tự động và đọc ảnh tự kiểm); …". Cách tự kiểm không đổi.

## Task 7.6: Voice Design thật cho bà nội

- Studio thử: cổng 4420 (kiểm `lsof` trước, trống), state `$T/studio.json`, root `$T/root-series`, `OPUS_VIDEO_HOME=$OVC` (main `40f8aeb`), pid 21961. Đã dừng: `OK-STOPPED`. 4317 vẫn pid 82168, không đụng tới.
- 16:00:35: `voice_design { project: "a-02", role: "ba-noi" }` qua `callTool` (actor `director:p07`) trả thẻ `c-mvm654p1-a302`, kind `elevenlabs`, "Tạo 3 giọng thử cho Bà nội, 1 lượt Voice Design", ước tính `{ voice_design: 1, previews: 3 }`.
- 16:00:39: người điều phối đồng ý thẻ đó, một lần duy nhất (theo lời cho phép ở `plan.md`). Job `j-mvm657ih-2aa6` chạy `voice-design.mjs --role=ba-noi design`, exit 0 lúc 16:00:53.
- Tốn: 1 lượt Voice Design ElevenLabs (job 14 s; công cụ chỉ gọi lại `/v1/text-to-voice/design` khi một lần trả ít hơn 3 bản, và Studio không đếm được số lần gọi trong công cụ). Không chạy `series_tts` thật, không gọi `/api/voice/pick`, không chạy `save`.
- Bản nghe thử (chép vào dự án): `/Volumes/2/Hoạt hình/content/261022-chuoi-kenh-ke-chuyen/video/a-02/.opus/voice-design/ba-noi/ba-noi-{1,2,3}.mp3`, dài 23,64 s, 28,37 s, 24,19 s. Bản gốc của công cụ: `S/voices/previews/ba-noi/` (kèm `previews.json`).
- `GET /api/voice/previews?name=a-02` có `ba-noi` với 3 bản, `can_set_speaker: true`.
- Biên nhận: một `voice-design` (exit 0, 3 output) và một `consent` mới; quét biên nhận a-02 không có chuỗi giống khóa (`OK-NO-KEY`).
- `cmp` cast.json với bản phase 06: `OK-CAST-UNCHANGED`.

## Chờ người dùng

Chọn giọng bà nội: nghe 3 bản ở trên, rồi bấm "Chọn giọng này" trên thẻ "Chọn giọng cho Bà nội" (tab Tài sản, tab Lời & giọng hoặc cột Đạo diễn của a-02, trên Studio đã chạy bản `67232cb`). Bấm sẽ chạy `voice-design save --role ba-noi --pick <n>`, ghi `voices/cast.json` và giao đạo diễn lồng tiếng các câu của bà nội. Studio 4317 đang chạy mã cũ (pid 82168, không restart theo ràng buộc), nên cần restart 4317 trước khi thẻ này hoạt động ở đó.

## Rủi ro còn lại

- Luật "không gọi phần giọng của `eleven.mjs` trực tiếp" chỉ nằm trong prompt đạo diễn; Studio không chặn được lệnh shell đạo diễn tự chạy. Kiểm sau mỗi tập: mọi file giọng mới có biên nhận `series-tts` hoặc `voice-design` tương ứng (ghi ở `docs/series.md`).
- `voice-design design` lặp gọi API khi một lần trả ít hơn 3 bản; thẻ ghi "1 lượt" là số thường gặp, không phải trần.
- Lần build giao diện khi khởi động Studio thử đã ghi lại bản build của `/Volumes/2/Motion-Studio`, nên trang 4317 tải lại sẽ nhận giao diện mới trên server cũ. Route mới thiếu (404) thì giao diện coi như không có series voice, không vỡ.

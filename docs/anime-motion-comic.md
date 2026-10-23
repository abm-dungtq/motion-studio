# Anime motion-comic

Tab **Anime** của Studio làm video kiểu anime "motion comic": ảnh tĩnh ghép lớp, cộng hoạt hình giới hạn (lật ảnh biến thể, nhép miệng, chớp mắt, gió, chuỗi tư thế có khung nhoè, khung impact). Không dùng image-to-video. Cách làm này lấy từ dự án `zoro-vs-mihawk`.

## Học từ AIComicBuilder

Nguồn: [LingyiChen-AI/AIComicBuilder](https://github.com/LingyiChen-AI/AIComicBuilder), commit `e01e7dd`, giấy phép Apache-2.0. Chỉ đọc mã, không chạy.

- Prompt sheet nhân vật (`src/lib/ai/prompts/character-image.ts`) là một bảng 4 góc trên cùng một ảnh: trước, ¾, nghiêng 90°, sau. Bốn góc phải cùng tỷ lệ, cùng mép đầu, cùng trang phục và cùng biểu cảm.
- Mô tả nhân vật là nguồn duy nhất cho phong cách. Chữ "realistic" chỉ nói độ chi tiết, không biến tranh thành ảnh chụp.
- Sheet là tham chiếu chuẩn duy nhất. Mọi khung sau đều đính kèm sheet để nhân vật giữ nhất quán (`frame-generate.ts`).
- Kanban phân cảnh (`src/components/editor/shot-kanban.tsx`) xếp shot theo giai đoạn. Giai đoạn suy từ dữ liệu đang có (có khung chưa, có prompt chưa, có video chưa), không lưu trạng thái riêng.
- Studio đổi hai chỗ. Sheet đặt trên nền màu tách (key colour), không phải nền trắng. Sheet không in tên, vì chữ trên sheet sẽ lọt vào mọi tư thế. Mẫu prompt nằm ở `lib/anime/prompts.mjs`, đầu file có ghi nguồn.

## Quy trình 8 bước

1. **Brief và kịch bản.** Lời tiếng Việt phải qua cổng kiểm tiếng Việt của workspace trước khi đọc TTS.
2. **Character sheet.** Mục Nhân vật: thêm nhân vật, chọn màu nền tách, ghi mô tả, bấm "Sinh sheet". Sheet nằm ở `assets/chars/<id>-sheet.png`.
3. **Plate bản thử.** Plate nền và plate nhân vật của vài shot, đặt trong `assets/plates/<shot>-*.png` (nền `-bg`, cả khung `-full`). Ảnh gốc của agent để trong `assets/plates/raw/`.
4. **Composite và cổng kiểm.** Dựng `index.html`: mỗi nhân vật là một phần tử có `id`, các mốc thời gian nằm trong khối `window.TIMING` (do lệnh timing của provider ghi).
5. **Plate còn lại** cho mọi shot. Shot board cho thấy shot nào còn thiếu.
6. **Âm thanh**: giọng, SFX, nhạc. Track lipsync đọc `<giọng>.mp3.words.json`.
7. **Biến thể hoạt hình.** Shot board: chọn shot, chọn ảnh gốc, đính sheet, ghi thay đổi, bấm "Sinh biến thể". Mỗi lần tốn 1 ảnh quota.
8. **Dựng hoạt hình.** Mục Hoạt hình: thêm track, sửa thời điểm và offsets, bấm "Lưu và build". Sau đó render.

## Luật màu nền

- Nền chuẩn là `#0047FF`. Agent thường trả `#004FFD` hoặc `#004CFE`, nên Studio đo màu thật của từng ảnh: trung vị 4 góc, mỗi góc 16×16 px. Không dùng màu trong prompt.
- Không dùng nền xanh lá khi nhân vật có màu xanh lá (tóc Zoro). Không dùng magenta khi video có tông đỏ.
- Chuỗi lọc (`lib/anime/keying.mjs`) là `scale=<rộng plate>:-2:flags=lanczos,chromakey=<màu đo>:0.18:0.06,despill=type=blue:mix=0.6:expand=0.1,format=rgba`. Kênh xanh lá trội thì dùng `despill=type=green`. Không kênh nào trội thì bỏ despill.
- Trang phục bị despill đổi màu (vụ quần Mihawk thành hồng) thì bật "Despill chỉ ở viền". Bên trong nhân vật giữ màu gốc; chỉ một viền mảnh, lấy bằng cách co alpha 3 lần, được khử màu nền.
- Còn sót viền thì tăng `sim` từng 0,02. Mép răng cưa thì tăng `blend`.

## Lệch khung thì sửa bằng offsets, không sinh lại

Tư thế sinh lại thường lệch vài px so với ảnh gốc. Mở mục Hoạt hình, chọn stack, thêm offsets cho tư thế đó (`x`, `y`, `scale`, chỉ nhận số), bấm "Lưu và build". Sinh lại tốn quota và lần sau vẫn lệch.

## Luật tất định

Trong `index.html`, `assets/fx/*.js` và `assets/anim/anim.js` không dùng `Math.random`, `Date`, `performance.now`, `requestAnimationFrame` hay trạng thái tích luỹ. Mọi hiệu ứng là hàm thuần của thời gian, chạy qua timeline GSAP. `build.mjs` dàn mọi luật thành danh sách khung cố định; rung máy dùng hash số nguyên, không dùng số ngẫu nhiên. Build hai lần phải ra cùng một `anim-data.js` (có test).

## Hệ lật ảnh trong dự án

Hệ lật ảnh là mã của dự án, không phải của Studio. Studio chỉ chép mẫu một lần, rồi chạy bản `build.mjs` của chính dự án.

| File | Việc |
|---|---|
| `assets/anim/manifest.json` | Luật: `fps`, `dir`, `stacks`, `impacts` |
| `assets/anim/build.mjs` | Dàn manifest ra `assets/anim/anim-data.js` (`window.StudioAnimData`, kèm alias `window.ZvmAnimData`) |
| `assets/anim/anim.js` | `StudioAnim.apply(tl, StudioAnimData)` dựng stack tư thế bằng `tl.set` (cắt cứng). Alias `ZvmAnim` |
| `assets/anim/manifest.example.json` | Ví dụ đủ các loại track |

"Bật hệ lật ảnh" chép `templates/anim/*` vào `assets/anim/` và tạo `manifest.json` trống. File có sẵn không bị ghi đè. `index.html` phải nạp `anim-data.js` rồi `anim.js`, và gọi `StudioAnim.apply(tl, window.StudioAnimData)` trước khi code khác đọc `.plate-bg`. Khối `TIMING` phải là JSON (khoá có ngoặc kép), như lệnh timing ghi ra.

### Manifest

- Mỗi stack ứng với một phần tử `id` trong `index.html`, gồm `shot` (id cảnh trong `TIMING`) và `tracks`.
- Loại track:
  - `lipsync`: `voice` (id thẻ `<audio>`), `open`, `half`, `closed`, `idle`, `from`, `to`;
  - `blink`: `pose`, `at[]`, `frames`;
  - `wind`: `frames[]`, `fps`, `phase`;
  - `keys`: danh sách `{ pose, frames | sec, smear? }`.
- `impacts[]`: `{ at, frames, mode: "invert" | "silhouette", stack }`. `silhouette` cần `stack` có thật.
- `offsets`: `{ <tư thế>: { x, y, scale } }`, chỉ nhận số.
- Thời điểm là số giây, hoặc `"<cảnh>[+|-giây]"`, `"<cảnh>.end"`, hay id thẻ `<audio>`.
- Các khoá khác (`tweens`, `smears`, `tremor`, `steps`, `ghosts`, `streaks`, `breathe`, `origin`, `fallback`, `motion`) sửa trong ô JSON của stack. Studio giữ nguyên chúng và thứ tự khoá cũ.
- Tư thế thiếu file không làm build lỗi: build hiện dòng WARN và dùng `base`. Thả PNG vào sau là shot tự đổi.

## Ghi an toàn

- Mỗi lần lưu manifest, bản cũ được chép vào `.opus/anim-backups/<thời điểm>.json`, rồi bản mới được ghi nguyên tử.
- Lưu kèm `base_sha` của bản đang sửa. File đã đổi từ lúc tải thì trả 409 và không ghi gì.
- Dự án có video `renders/*final*.mp4` (đã giao) thì lưu và build phải xác nhận (428 nếu thiếu `confirm`).
- Biến thể không bao giờ ghi đè: tên trùng thì thêm `-2`, `-3` cho cả ảnh gốc và ảnh đã tách nền.
- Mỗi biến thể có biên nhận `anime-variant` trong `.opus/receipts/`: ảnh gốc, sheet, prompt, màu đo, thông số tách nền, cách phóng to, sha256 của ảnh gốc và ảnh đã tách. Bước sinh ảnh có thêm biên nhận `image-generate` của registry agent.

## Phóng to

Mặc định dùng lanczos tới đúng rộng của plate cùng shot. Thứ tự lấy rộng: ảnh gốc (nếu không nằm trong `raw/`), rồi plate `assets/plates/<shot>-*.png`, rồi 2208 px. Nếu trên máy có `realesrgan-ncnn-vulkan` thì Studio dùng nó trước (model `realesrgan-x4plus-anime`), rồi mới lanczos. Studio chỉ phát hiện, không cài. Cách đã dùng được ghi vào biên nhận.

## Shot board

- Có `project.json` thì board lấy shot từ đó. Chưa có thì board lấy các shot mà `manifest.stacks[*].shot` nhắc tới, xếp theo `TIMING`, kèm nhãn "chưa nhập project.json".
- Cột suy từ file đang có, không lưu riêng:
  - Thiếu plate: chưa có `assets/plates/<shot>-*.png`;
  - Có plate;
  - Có biến thể: có ảnh trong `assets/plates/anim/<shot>-*.png`;
  - Đã có track: một stack của shot có track.
- Bấm một shot thì Studio phát sự kiện `anime:shot`. Nếu dự án đã mở trên timeline, Studio chọn shot đó và tua tới đầu shot.

## API và tool

| Route | Việc |
|---|---|
| `GET /api/anime/board?name=` | Shot board |
| `GET /api/anime/chars?name=` | Thư viện nhân vật |
| `GET /api/anime/manifest?name=` | `{ exists, enabled, manifest, sha, final, backups }` |
| `GET /api/anime/job?name=&id=` | Một job `anime` / `anime-build` kèm toàn bộ log và các dòng WARN |
| `POST /api/anime/chars` | `{ char }` thêm hoặc thay; `{ remove }`; `{ generate: { id, description } }` là job sinh sheet |
| `POST /api/anime/variant` | `{ shot, base, chars, change, out_name, kind, sim, blend, width, spill, edge, agent }` là job `anime` |
| `POST /api/anime/manifest` | `{ base_sha, manifest, confirm, rebuild }` |
| `POST /api/anime/enable` | Bật hệ lật ảnh |
| `POST /api/anime/rebuild` | Job `anime-build` |

Mỗi dự án chỉ chạy một job `anime` và một job `anime-build` một lúc. Tool cho đạo diễn và client MCP gồm `anime_generate_variant` (cần Studio đang chạy), `anime_manifest_get` và `anime_manifest_set`.

Thư viện nhân vật nằm ở `assets/chars/chars.json`: `{ "chars": [{ id, name, sheet, key_color, notes, palette }] }`. File `assets/chars/<id>-sheet.png` chưa có trong thư viện vẫn hiện, kèm nút "Lưu vào thư viện".

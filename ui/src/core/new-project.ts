// Port of the constants and checks of public/new-project.js (commit 2d65edf): the fields of
// POST /api/projects/new and their limits, which match the server (create.mjs). The dialog is
// shell/NewProjectDialog.tsx. No React.
export const MODES = [
  { id: "tu-dau", label: "Làm từ đầu", hint: "Ví dụ: viết kịch bản 3 cảnh rồi dựng bản nháp" },
  { id: "video-co-san", label: "Dựng từ video có sẵn + B-roll", hint: "Ví dụ: dựng từ clip phỏng vấn đã thêm ở mục Footage, chèn B-roll minh hoạ" },
  { id: "theo-nhac", label: "Theo bài nhạc", hint: "Ví dụ: cắt hình theo nhịp bài nhạc trong assets/bgm" },
  { id: "mau-nhanh", label: "Mẫu nhanh", hint: "Ví dụ: tìm một video mẫu hợp chủ đề rồi làm theo" },
] as const;
export const ASPECTS = [["16:9", "16:9 ngang"], ["9:16", "9:16 dọc"], ["both", "Cả hai"]] as const;

export const NAME_PATTERN = "[a-z0-9][a-z0-9\\-]{1,48}";
export const LIMITS = { topic: 500, audience: 500, first_request: 4000, durationMin: 5, durationMax: 600 } as const;
export const DEFAULTS = { mode: "tu-dau", aspect: "16:9", duration: "30" } as const;

export interface NewProjectForm { name: string; mode: string; aspect: string; topic: string; duration: string; audience: string; first_request: string }
export interface NewProjectBody { name: string; mode: string; aspect: string; topic: string; duration: number; audience?: string; first_request?: string }

export const hintOf = (mode: string): string => MODES.find((m) => m.id === mode)?.hint ?? "";

// The request body (new-project.js submit): trimmed, optional fields only when filled.
export function bodyOf(f: NewProjectForm): NewProjectBody {
  return {
    name: f.name.trim(), mode: f.mode || DEFAULTS.mode, aspect: f.aspect || DEFAULTS.aspect,
    topic: f.topic.trim(), duration: Number(f.duration),
    ...(f.audience.trim() ? { audience: f.audience.trim() } : {}),
    ...(f.first_request.trim() ? { first_request: f.first_request.trim() } : {}),
  };
}

// The error shown in the dialog for a failed POST: the server's error and the last 3 stderr lines.
export function failureText(r: { status: number; error?: string; stderr?: unknown }): string {
  const tail = String(r.stderr ?? "").trim().split("\n").slice(-3).join("\n");
  return `${r.error ?? `Lỗi ${r.status}`}${tail ? `\n${tail}` : ""}`;
}

// Port of public/gate-cards.js (commit 22e7611); logic unchanged.
// gate-cards.js — what keeps a director card clickable while the AI panel redraws. No DOM here,
// so the tests import it under Node.
//
// The panel redraws on every request and job event. The director's `claude -p` exits a few
// seconds after studio_ask, right when the user aims at the new card: a rebuilt card swapped the
// button out under a press in progress (no click, no POST), and dropping the "Đạo diễn đang làm…"
// block below it moved the card down by that block's height, so the click landed on the video.
// Keeping the same card node is not enough either: a redraw puts it into a new panel, and a button
// taken out of the page between mousedown and mouseup gets no click even when it is put back
// (Chromium), so redraws wait for the press to end (pressGate).

export interface CardCache<T> {
  get(key: string, build: () => T): T;
  has(key: string): boolean;
  sweep(): void;
}
export interface PressGate {
  readonly pressed: boolean;
  press(): void;
  release(): (() => void) | null;
  run(draw: () => void): boolean;
}
export interface DirectorJob { kind?: string; status?: string; meta?: { request?: string } | null }
export interface AnswerResult { timeout?: boolean; network?: boolean; status?: number; stderr?: unknown; error?: string | null }

// Live card nodes by key, reused across redraws. A key holds whatever changes the card's markup
// (project, request, question time, open reject note); sweep() drops cards not drawn this time.
export function cardCache<T>(): CardCache<T> {
  const cards = new Map<string, T>();
  let used = new Set<string>();
  return {
    get(key, build) {
      used.add(key);
      if (!cards.has(key)) cards.set(key, build());
      return cards.get(key)!;
    },
    has: (key) => cards.has(key),
    sweep() {
      for (const k of cards.keys()) if (!used.has(k)) cards.delete(k);
      used = new Set();
    },
  };
}

// Holds redraws while a press is in progress inside the panel. run(draw) draws now, or keeps the
// latest draw for release(), which returns it (or null) for the caller to run once the click that
// ends the press has been dispatched.
export function pressGate(): PressGate {
  let down = false, queued: (() => void) | null = null;
  return {
    get pressed() { return down; },
    press() { down = true; },
    release() {
      down = false;
      const fn = queued;
      queued = null;
      return fn;
    },
    run(draw) {
      if (down) { queued = draw; return false; }
      draw();
      return true;
    },
  };
}

export const cardKey = (name: string, r: { id: string; ask?: { at?: string | number | null } | null }, again: unknown, rejecting: unknown): string => `${name}\n${r.id}\n${r.ask?.at ?? ""}\n${again ? "again" : "live"}\n${rejecting ? "reject" : ""}`;

// The director job to show as "đang làm": not the one whose request already waits on the user,
// since that job only winds down after studio_ask.
export function liveDirectorJob<J extends DirectorJob>(jobs: readonly J[], requests: readonly { id: string; status?: string }[]): J | null {
  const waiting = new Set<string | undefined>(requests.filter((r) => r.status === "waiting_user").map((r) => r.id));
  return jobs.find((j) => j.kind === "director" && (j.status === "running" || j.status === "cancelling") && !waiting.has(j.meta?.request)) ?? null;
}

// How long a card waits for /api/director/answer. The server's slowest step is make-pitch choose
// (60 s, gates.mjs), so a longer wait means Studio is stuck or gone.
export const ANSWER_TIMEOUT_MS = 90000;

// The line a card shows when its answer did not go through. r is ctx.send's result, or
// { network: true } when the request never reached the server, { timeout: true } when it got no
// answer in time, { error } when the page itself failed.
export function answerFailure(r: AnswerResult): string {
  if (r.timeout) return `Studio chưa trả lời sau ${Math.round(ANSWER_TIMEOUT_MS / 1000)} giây. Tải lại trang (⌘R) để xem câu trả lời đã được ghi chưa rồi bấm lại nếu cần.`;
  if (r.network) return "Không gửi được tới Studio (mất kết nối). Kiểm tra Studio còn chạy rồi bấm lại.";
  if (r.status === 403) return "Studio đã khởi động lại nên trang này hết phiên. Tải lại trang (⌘R) rồi bấm lại.";
  const why = String(r.stderr ?? "").trim().split("\n").pop();
  return `Chưa gửi được câu trả lời: ${r.error ?? `lỗi ${r.status}`}${why ? ` (${why})` : ""}. Bấm lại để thử.`;
}

// gate-cards.js — what keeps a director card clickable while the AI panel redraws. No DOM here,
// so the tests import it under Node.
//
// The panel redraws on every request and job event. The director's `claude -p` exits a few
// seconds after studio_ask, right when the user aims at the new card: a rebuilt card swapped the
// button out under a press in progress (no click, no POST), and dropping the "Đạo diễn đang làm…"
// block below it moved the card down by that block's height, so the click landed on the video.

// Live card nodes by key, reused across redraws. A key holds whatever changes the card's markup
// (project, request, question time, open reject note); sweep() drops cards not drawn this time.
export function cardCache() {
  const cards = new Map();
  let used = new Set();
  return {
    get(key, build) {
      used.add(key);
      if (!cards.has(key)) cards.set(key, build());
      return cards.get(key);
    },
    has: (key) => cards.has(key),
    sweep() {
      for (const k of cards.keys()) if (!used.has(k)) cards.delete(k);
      used = new Set();
    },
  };
}

export const cardKey = (name, r, again, rejecting) => `${name}\n${r.id}\n${r.ask?.at ?? ""}\n${again ? "again" : "live"}\n${rejecting ? "reject" : ""}`;

// The director job to show as "đang làm": not the one whose request already waits on the user,
// since that job only winds down after studio_ask.
export function liveDirectorJob(jobs, requests) {
  const waiting = new Set(requests.filter((r) => r.status === "waiting_user").map((r) => r.id));
  return jobs.find((j) => j.kind === "director" && (j.status === "running" || j.status === "cancelling") && !waiting.has(j.meta?.request)) ?? null;
}

// The line a card shows when its answer did not go through. r is ctx.send's result, or
// { network: true } when the request never reached the server.
export function answerFailure(r) {
  if (r.network) return "Không gửi được tới Studio (mất kết nối). Kiểm tra Studio còn chạy rồi bấm lại.";
  if (r.status === 403) return "Studio đã khởi động lại nên trang này hết phiên. Tải lại trang (⌘R) rồi bấm lại.";
  const why = String(r.stderr ?? "").trim().split("\n").pop();
  return `Chưa gửi được câu trả lời: ${r.error ?? `lỗi ${r.status}`}${why ? ` (${why})` : ""}. Bấm lại để thử.`;
}

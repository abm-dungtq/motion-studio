import { describe, expect, it } from "vitest";
import { currentQa, currentRender, latest, parseQa } from "./qa-parse.ts";

// Lines as the QA tools write them (copied from real QA.md files).
const QA = `# QA

## qc-mp4 demo-9x16.mp4 2026-10-29 17:03

- PASS ASPECT 1080×1920 khớp aspect 9:16
- PASS DURATION 15.02s so với BRIEF 15s (lệch 0.12%)
- PASS FREEZE không có đoạn đứng hình ≥ 2s
- WARN FREEZE đứng hình 87.77–89.8s (2.0s)
- WARN SILENCE lặng 28.52–30.02s (1.5s)
- WARN LOUDNESS I -17.2 LUFS (mục tiêu -16…-12)
- qc-mp4: WARN (3 WARN, 0 FAIL)

## BALANCE (2026-10-29T10:03:50.000Z)

FAIL BALANCE nhạc dưới giọng 13.2 dB (lúc có lời), nhạc lúc không lời −35.7 dBFS

## WORD (2026-10-29T10:03:56.216Z)

PASS  WORD   không có hàng chữ

## SYNC (2026-10-29T10:03:57.406Z)

PASS  SYNC   0.883s Con dấu TỰ UỐNG CẠN đập xuống ← assets/sfx/stamp.mp3 lệch +0 ms (đầu file im 0 ms)
PASS  SYNC   10.4s Lật bàn 3D ← assets/sfx/whoosh.mp3 lệch +44 ms (đầu file im 44 ms)

## Ghi chú (không chặn giao)

- WARN SILENCE 28,52–30,02 s: thẻ kết đứng yên sau câu đọc cuối, có chủ đích.

## BALANCE (2026-10-30T02:00:00.000Z)

PASS BALANCE nhạc dưới giọng 6.4 dB (lúc có lời)
`;

describe("parseQa", () => {
  const { sections } = parseQa(QA);

  it("reads the four known sections and skips the notes under any other heading", () => {
    expect(sections.map((s) => [s.gate, s.file ?? null, s.at])).toEqual([
      ["qc-mp4", "demo-9x16.mp4", "2026-10-29 17:03"],
      ["BALANCE", null, "2026-10-29T10:03:50.000Z"],
      ["WORD", null, "2026-10-29T10:03:56.216Z"],
      ["SYNC", null, "2026-10-29T10:03:57.406Z"],
      ["BALANCE", null, "2026-10-30T02:00:00.000Z"],
    ]);
  });

  it("gives a range its span and skips the summary line", () => {
    const qc = sections[0]!.items;
    expect(qc).toHaveLength(6);
    expect(qc[3]).toEqual({ level: "WARN", code: "FREEZE", text: "đứng hình 87.77–89.8s (2.0s)", t: 87.77, until: 89.8 });
    expect(qc[4]).toMatchObject({ code: "SILENCE", t: 28.52, until: 30.02 });
  });

  it("takes no time from lengths and limits in qc-mp4 lines", () => {
    const [aspect, duration, freezeOk, , , loud] = sections[0]!.items;
    for (const x of [aspect, duration, freezeOk, loud]) expect(x).not.toHaveProperty("t");
  });

  it("gives a SYNC line its leading time alone; BALANCE and WORD without one get none", () => {
    expect(sections[3]!.items.map((x) => [x.t, x.until])).toEqual([[0.883, undefined], [10.4, undefined]]);
    expect(sections[1]!.items[0]).toEqual({ level: "FAIL", code: "BALANCE", text: "nhạc dưới giọng 13.2 dB (lúc có lời), nhạc lúc không lời −35.7 dBFS" });
    expect(sections[2]!.items[0]).not.toHaveProperty("t");
  });

  it("is empty for no file", () => {
    expect(parseQa(null).sections).toEqual([]);
    expect(parseQa("").sections).toEqual([]);
  });
});

describe("latest and currentRender", () => {
  it("keeps the later BALANCE", () => {
    const b = latest(parseQa(QA).sections).filter((s) => s.gate === "BALANCE");
    expect(b).toHaveLength(1);
    expect(b[0]!.items[0]!.level).toBe("PASS");
  });

  it("keeps one qc-mp4 per file and prefers a final render over a newer draft", () => {
    const md = `## qc-mp4 a-final.mp4 2026-10-01 10:00\n- PASS FREEZE ok\n## qc-mp4 a-16x9.mp4 2026-10-02 10:00\n- WARN FREEZE đứng hình 1–4s (3s)\n## qc-mp4 a-final.mp4 2026-10-03 09:00\n- WARN SILENCE lặng 5–7s (2s)\n`;
    const { sections } = parseQa(md);
    expect(latest(sections).map((s) => `${s.file} ${s.at}`)).toEqual(["a-final.mp4 2026-10-03 09:00", "a-16x9.mp4 2026-10-02 10:00"]);
    expect(currentRender(sections)?.items[0]?.code).toBe("SILENCE");
  });

  it("without a final render takes the newest one", () => {
    const md = `## qc-mp4 x-9x16-9x16.mp4 2026-10-29 17:03\n- WARN SILENCE lặng 28.52–30.02s (1.5s)\n## qc-mp4 x-9x16.mp4 2026-10-29 19:00\n- PASS SILENCE không có đoạn lặng ≥ 1.5s\n`;
    const cur = currentRender(parseQa(md).sections);
    expect(cur?.file).toBe("x-9x16.mp4");
    // The older render's timed WARN was fixed by the newer render: nothing timed is left to show.
    expect(cur?.items.filter((x) => x.level !== "PASS")).toEqual([]);
  });

  it("currentQa is the current render then the newest of each other gate", () => {
    expect(currentQa(QA).map((s) => `${s.gate} ${s.at}`)).toEqual(["qc-mp4 2026-10-29 17:03", "BALANCE 2026-10-30T02:00:00.000Z", "WORD 2026-10-29T10:03:56.216Z", "SYNC 2026-10-29T10:03:57.406Z"]);
  });
});

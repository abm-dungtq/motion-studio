// The delivery panel of a series episode in the export dialog (GET /api/delivery, routes/delivery.mjs):
// five rows (Video, Thumbnail, Tiêu đề và mô tả, Phụ đề, Drive), each with its state ("chưa có",
// "đã có trong tap-N", "lỗi: …") and a button that runs it. Nothing is ever written over: a step
// that places a different file of the same name adds -2, -3. The Drive button and the thumbnail
// drawing only write a consent card; their waiting cards (useConsent, actions drive-upload and
// thumbnail) show under their row. The three thumbnail drafts are picked here: the pick becomes
// thumbnail.jpg of the delivery folder. A text or captions row that failed can be handed to the
// director (POST /api/delivery/ask). Nothing when the project is in no series.
import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, ApiError, queryClient, say, send } from "@/api/client.ts";
import { Button, Input } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { POLL_MS, projectSrc, useConsent } from "./api.ts";
import { ConsentCard } from "./ConsentCard.tsx";
import type { ConsentCardData } from "./types.ts";

export type RowKey = "video" | "thumbnail" | "text" | "captions" | "drive";
export interface RowError { code: string | number; count: number; last: string; tail: string[] }
export interface DeliveryRow { files: string[]; error: RowError | null; drafts?: string[]; last?: { at: string; ok: boolean | null } | null }
export interface DeliveryStatus {
  series: string;
  episode: number;
  folder: string;
  exists: boolean;
  files: { name: string; size: number }[];
  rows: Record<RowKey, DeliveryRow>;
  input: string | null;
  drive: { folder: string; account: string } | null;
  can: Record<"text" | "captions" | "export" | "thumbnail" | "drive", boolean>;
  jobs: { id: string; kind: string; meta?: { step?: string }; tail?: string[] }[];
}
type Card = ConsentCardData & { action?: { name?: string } };

const enc = encodeURIComponent;
export const deliveryKey = (name: string | null) => ["/api/delivery", name] as const;
const deliveryQuery = (name: string | null) => queryOptions({
  queryKey: deliveryKey(name),
  queryFn: async (): Promise<DeliveryStatus | null> => {
    try { return await api<DeliveryStatus>(`/api/delivery?name=${enc(name ?? "")}`); } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
});

const LABEL: Record<RowKey, string> = { video: "Video", thumbnail: "Thumbnail", text: "Tiêu đề và mô tả", captions: "Phụ đề", drive: "Drive" };
const STEP: Record<RowKey, string> = { video: "deliver-export", thumbnail: "deliver-thumbnail", text: "deliver-text", captions: "deliver-captions", drive: "deliver-drive" };
const tap = (folder: string) => folder.split("/").at(-1) ?? folder;

export function rowText(row: DeliveryRow, folder: string): string {
  if (row.error) return `lỗi: ${row.error.tail.at(-1) ?? `mã ${row.error.code}`}`;
  if (row.files.length) return `đã có trong ${tap(folder)}: ${row.files.join(", ")}`;
  return "chưa có";
}

const SLOW_MS = 5 * 60000;

export function DeliveryList({ name }: { name: string }) {
  const q = useQuery({ ...deliveryQuery(name), refetchInterval: (x) => (x.state.data?.jobs.length ? POLL_MS : false) });
  const consent = useConsent(name, Boolean(q.data));
  const [busy, setBusy] = useState<RowKey | null>(null);
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const d = q.data;
  if (q.error) return <p className="m-0 text-xs text-warn">{`Giao nộp: ${(q.error as Error).message}`}</p>;
  if (!d) return null;
  const cards = (consent.data ?? []) as Card[];
  const cardOf = (action: string) => cards.filter((c) => c.action?.name === action);
  const running = (row: RowKey) => d.jobs.some((j) => j.meta?.step === STEP[row]);
  const reload = () => queryClient.invalidateQueries({ queryKey: deliveryKey(name) });

  async function run(row: RowKey, path: string, body: Record<string, unknown>, done: (r: Record<string, unknown>) => string | null) {
    setBusy(row);
    const r = await send(path, { name, ...body }, { timeout: SLOW_MS }) as unknown as { status: number; error?: string } & Record<string, unknown>;
    setBusy(null);
    await reload();
    if (r.status !== 200) { say(r.error ?? `Không chạy được ${LABEL[row]}`, true); return; }
    if (r.ok === false) { say(String(r.message ?? r.error ?? `${LABEL[row]} chưa qua`), true); return; }
    const msg = done(r);
    if (msg) say(msg);
  }
  async function ask(row: "text" | "captions") {
    const r = await send("/api/delivery/ask", { name, row });
    if (r.status !== 200) { say(r.error ?? "Không gửi được yêu cầu cho đạo diễn", true); return; }
    say("Đã nhờ đạo diễn sửa");
  }

  const files = (r: Record<string, unknown>) => (Array.isArray(r.files) ? `Đã giao: ${(r.files as string[]).join(", ")}` : null);
  const thumbs = d.rows.thumbnail.drafts ?? [];

  return (
    <section aria-label="Giao nộp" className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h3 className="m-0 text-sm font-semibold">{`Giao nộp tập ${d.episode} vào ${d.folder}`}</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <Row label={LABEL.video} text={rowText(d.rows.video, d.folder)} error={Boolean(d.rows.video.error)}>
          <Button disabled={!d.can.export || !d.input || busy != null || running("video")} onClick={() => void run("video", "/api/delivery/export", {}, () => `Đang xuất ${d.input} cho YouTube, Facebook, TikTok`)}>
            {running("video") ? "Đang xuất…" : "Xuất 3 nền tảng"}
          </Button>
          {!d.input ? <p className="m-0 text-xs text-muted-foreground">Chưa có renders/*-final.mp4: bấm Xuất video trước.</p> : null}
        </Row>

        <Row label={LABEL.thumbnail} text={rowText(d.rows.thumbnail, d.folder)} error={Boolean(d.rows.thumbnail.error)}>
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label="Dòng chữ 1" placeholder="Dòng 1" value={line1} maxLength={60} onChange={(e) => setLine1(e.currentTarget.value)} />
            <Input aria-label="Dòng chữ 2" placeholder="Dòng 2" value={line2} maxLength={60} onChange={(e) => setLine2(e.currentTarget.value)} />
            <Button disabled={!d.can.thumbnail || !line1.trim() || !line2.trim() || busy != null || running("thumbnail")} onClick={() => void run("thumbnail", "/api/delivery/thumbnail", { line1, line2 }, () => "Đã tạo thẻ đồng ý vẽ 3 ảnh nền")}>
              {running("thumbnail") ? "Đang vẽ…" : "Vẽ 3 thumbnail"}
            </Button>
          </div>
          {cardOf("thumbnail").map((c) => <ConsentCard key={c.id} name={name} card={c} onAnswered={() => void reload()} />)}
          {thumbs.length ? (
            <ul aria-label="Chọn thumbnail" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
              {thumbs.map((t, i) => (
                <li key={t} className="flex flex-col gap-1">
                  <img src={projectSrc(name, t, String(q.dataUpdatedAt))} alt={`Thumbnail ${i + 1}`} className="w-full rounded" loading="lazy" />
                  <Button disabled={busy != null} onClick={() => void run("thumbnail", "/api/delivery/thumbnail/pick", { n: i + 1 }, files)}>{`Chọn ảnh ${i + 1}`}</Button>
                </li>
              ))}
            </ul>
          ) : null}
        </Row>

        <Row label={LABEL.text} text={rowText(d.rows.text, d.folder)} error={Boolean(d.rows.text.error)}>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!d.can.text || busy != null} onClick={() => void run("text", "/api/delivery/text", {}, files)}>{busy === "text" ? "Đang kiểm…" : "Kiểm và giao"}</Button>
            {d.rows.text.error ? <Button onClick={() => void ask("text")}>Nhờ đạo diễn sửa</Button> : null}
          </div>
        </Row>

        <Row label={LABEL.captions} text={rowText(d.rows.captions, d.folder)} error={Boolean(d.rows.captions.error)}>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!d.can.captions || busy != null} onClick={() => void run("captions", "/api/delivery/captions", {}, files)}>{busy === "captions" ? "Đang tạo…" : "Tạo và giao"}</Button>
            {d.rows.captions.error ? <Button onClick={() => void ask("captions")}>Nhờ đạo diễn sửa</Button> : null}
          </div>
        </Row>

        <Row label={LABEL.drive} text={d.drive ? `${rowText(d.rows.drive, d.folder)} · ${d.drive.account}/${d.drive.folder}` : "series chưa khai báo drive"} error={Boolean(d.rows.drive.error)}>
          <Button disabled={!d.can.drive || !d.files.length || busy != null || running("drive")} onClick={() => void run("drive", "/api/delivery/drive", {}, () => "Đã tạo thẻ đồng ý tải lên Drive")}>
            {running("drive") ? "Đang tải…" : "Tải lên Drive"}
          </Button>
          {cardOf("drive-upload").map((c) => <ConsentCard key={c.id} name={name} card={c} onAnswered={() => void reload()} />)}
        </Row>
      </ul>
    </section>
  );
}

function Row({ label, text, error, children }: { label: string; text: string; error: boolean; children: React.ReactNode }) {
  return (
    <li aria-label={label} className="flex flex-col gap-1.5 rounded border border-border p-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-xs ${error ? "text-warn" : "text-muted-foreground"}`}>{text}</span>
      </div>
      {children}
    </li>
  );
}

// For a section host: the open project's delivery.
export function DeliveryPanel() {
  const name = useStudio((s) => s.name);
  return name ? <DeliveryList key={name} name={name} /> : null;
}

// lib/tools/suggest.mjs — style_suggest: ranks the creative directions, style profiles and the way
// of working for one project, from BRIEF.md and the start of its script. It shares lib/suggest.mjs
// with the /api/suggest routes (routes/suggest.mjs) and writes <project>/.opus/suggest/latest.json,
// which the suggestion card of the Director tab reads. It never writes BRIEF.md and never chooses
// for the user: the choice is the user's click on the card (POST /api/suggest/choose).
// While observing, the result holds both sources, labelled and in the card's column order, so the
// director talks about the two rankings as evenly as the card shows them.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { suggestSetting } from "../config.mjs";
import { columnsOf, effectiveSource, suggestCached } from "../suggest.mjs";

const TOP = 3;
const LABEL = { jev: "Jev", det: "Tất định" };

const sideOf = (key, side) => ({
  source: key, label: LABEL[key],
  directions: side.directions.slice(0, TOP).map(({ id, label, score, reason, source }) => ({ id, label, score, reason, source })),
  styles: side.styles.slice(0, TOP).map(({ id, label, score, reason, source, directions }) => ({ id, label, score, reason, source, directions })),
  workflow: side.workflow,
});

export const TOOLS = [
  {
    name: "style_suggest",
    title: "Gợi ý hướng, style và quy trình",
    description: "Xếp hạng hướng sáng tạo, style và chế độ vận hành cho một dự án, từ BRIEF.md và đầu kịch bản. Dùng Jev khi được bật, không thì dùng gợi ý tất định. Kết quả có sources, mỗi nguồn một mục có nhãn. Khi đang so sánh hai nguồn, sources có cả Jev và tất định. Kết quả hiện thành thẻ trong tab Đạo diễn để người dùng tự chọn. Tool này không chọn thay người dùng và không ghi BRIEF.md.",
    inputSchema: {
      type: "object", required: ["project"],
      properties: {
        project: { type: "string", description: "Tên thư mục dự án (project_list)" },
        refresh: { type: "boolean", description: "Tính lại dù brief không đổi" },
      },
    },
    mutates: true, provider: true,
    async run({ project, refresh = false }, env) {
      const dir = env.projectDir(project);
      if (!existsSync(join(dir, "BRIEF.md"))) throw Object.assign(new Error(`dự án ${project} chưa có BRIEF.md`), { status: 409 });
      const rec = await suggestCached({ dir, project, P: env.P, refresh, source: effectiveSource(suggestSetting()) });
      const sources = columnsOf(rec).map((k) => sideOf(k, k === "jev" ? rec.jev : rec.det));
      return {
        project, source: rec.source, shown: rec.shown, error: rec.error?.message ?? null,
        sources,
        ...(sources.length > 1 ? { compare: "Thẻ đang đặt hai nguồn cạnh nhau để so sánh. Khi nói với người dùng, nêu cả hai nguồn ngang nhau và không nghiêng về nguồn nào." } : {}),
        card: "Thẻ gợi ý đã hiện trong tab Đạo diễn. Chờ người dùng bấm chọn; không chạy lệnh chọn hướng.",
      };
    },
  },
];

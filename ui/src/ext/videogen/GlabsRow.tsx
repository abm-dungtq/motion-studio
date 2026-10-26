// The agent dialog's G-Labs row: webhook up or not, key present, clips sent today against the cap.
import { useQuery } from "@tanstack/react-query";
import type { AgentRowProps } from "@/ext/registry.ts";
import { vgStatus } from "./api.ts";

export function GlabsRow(_: AgentRowProps) {
  const { data: st } = useQuery({ queryKey: ["videogen", "status"], queryFn: vgStatus, refetchInterval: 5000 });
  return (
    <div className="flex flex-col gap-0.5 text-xs" data-testid="glabs-row">
      <div>
        <strong>G-Labs (clip AI)</strong>: {st ? (st.up ? "webhook đang mở" : "webhook chưa mở") : "đang kiểm…"}
        {st && <> · khoá: {st.key ? "có" : "chưa"} · hôm nay: {st.today}/{st.cap}</>}
      </div>
      <div className="text-muted-foreground">Trần chỉ tính lượt gửi từ Studio; lượt tạo trong app G-Labs hay script khác không tính.</div>
    </div>
  );
}

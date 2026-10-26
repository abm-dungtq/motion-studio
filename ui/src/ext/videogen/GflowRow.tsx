// The agent dialog's gflow row: binary and version, profile, images and clips sent today against
// their caps, a WAF block, and a sign-in check that runs only when pressed (it opens no browser).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AgentRowProps } from "@/ext/registry.ts";
import { Button } from "@/shell/controls.tsx";
import { hhmm, vgAuth, vgStatus } from "./api.ts";

export function GflowRow(_: AgentRowProps) {
  const { data: st } = useQuery({ queryKey: ["videogen", "status"], queryFn: vgStatus, refetchInterval: 5000 });
  const [auth, setAuth] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const r = await vgAuth();
      setAuth(r.status !== 200 ? (r.error ?? `lỗi ${r.status}`) : r.ok ? "đăng nhập còn hạn" : `cần gflow auth login (mã ${r.code})`);
    } finally { setChecking(false); }
  };
  return (
    <div className="flex flex-col gap-0.5 text-xs" data-testid="gflow-row">
      <div>
        <strong>Google Flow (gflow)</strong>: {!st ? "đang kiểm…" : !st.found ? `chưa có gflow ở ${st.bin}` : <>
          {st.version ?? "?"}{!st.tested && " (chưa kiểm với Studio)"} · profile: {st.profile ?? "chưa có"} · video hôm nay: {st.today}/{st.cap} · ảnh: {st.images_today}/{st.image_cap}
          {st.waf_until && <> · <span className="text-warn">Flow chặn tới {hhmm(st.waf_until)}</span></>}
        </>}
      </div>
      {st?.found && st.profile && (
        <div className="flex items-center gap-2">
          <Button disabled={checking || Boolean(st.job)} onClick={() => void check()}>Kiểm đăng nhập</Button>
          {auth && <span>{auth}</span>}
        </div>
      )}
      <div className="text-muted-foreground">Trần chỉ tính lượt gửi từ Studio; lượt tạo trên Flow hay script khác không tính.</div>
    </div>
  );
}

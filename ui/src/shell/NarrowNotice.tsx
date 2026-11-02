// The strip under the top bar when the window is narrower than the 1280 px the layout is made
// for. "Ẩn" hides it for the rest of the browser session.
import { useEffect, useState } from "react";
import { Button } from "./controls.tsx";

const QUERY = "(max-width: 1279px)";
const KEY = "ms-narrow-hidden";
const STRIP = "flex shrink-0 flex-wrap items-center gap-2 border-b border-warn/40 bg-warn/15 px-3 py-1.5 text-sm text-foreground";

function narrowNow(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

export function NarrowNotice() {
  const [narrow, setNarrow] = useState(narrowNow);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(KEY) === "1");
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const on = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", on);
    setNarrow(mq.matches);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (!narrow || hidden) return null;
  const hide = () => { sessionStorage.setItem(KEY, "1"); setHidden(true); };
  return (
    <div role="status" data-banner="narrow" className={STRIP}>
      <span>Studio thiết kế cho màn hình rộng từ 1280 px; một số nút có thể bị che.</span>
      <Button className="h-7" onClick={hide}>Ẩn</Button>
    </div>
  );
}

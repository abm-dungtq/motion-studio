// What a lazy tab or section (ext/lazy.ts) shows while its code loads. compact for a section
// inside a tab, the inspector or a dialog.
export function TabFallback({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-busy="true" className={compact ? "py-2 text-sm text-muted-foreground" : "flex min-h-40 flex-1 items-start text-sm text-muted-foreground"}>
      Đang tải…
    </div>
  );
}

// Port of the "Storyboard" details of public/panels.js:124-129; behaviour unchanged.
// STORYBOARD.md of the project, or "Chưa có STORYBOARD.md" when it is missing or unreadable.
import { useProjectText } from "@/api/queries.ts";

export function Storyboard({ name }: { name: string }) {
  const { data, isError, isPending } = useProjectText(name, "STORYBOARD.md");
  const text = isError ? "Chưa có STORYBOARD.md" : isPending ? "…" : (data ?? "Chưa có STORYBOARD.md");
  return (
    <details className="text-sm">
      <summary className="cursor-pointer select-none">Storyboard</summary>
      <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-border bg-background p-2 text-xs whitespace-pre-wrap">{text}</pre>
    </details>
  );
}

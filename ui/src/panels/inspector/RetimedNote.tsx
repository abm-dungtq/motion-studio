// Port of the retimed note of public/inspector.js:30; behaviour unchanged. Every view starts with
// it once a marker change rebuilt TIMING (store.retimed).
import { useStudio } from "@/store/studio.ts";
import { Note } from "./parts.tsx";

export function RetimedNote() {
  const retimed = useStudio((s) => s.retimed);
  return retimed ? <Note role="retimed">Mốc đã đổi, TIMING đã dựng lại: animatic cần duyệt lại trước khi xuất</Note> : null;
}

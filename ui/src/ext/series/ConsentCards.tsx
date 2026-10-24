// Every consent card the project still waits on (GET /api/consent), whatever step wrote it: an
// image batch, voices to make or lines to voice, an upload. One list for the Tài sản tab and the
// Lời & giọng tab, so a card shows once in each and never twice in one place.
import { useStudio } from "@/store/studio.ts";
import { useConsent } from "./api.ts";
import { ConsentCard } from "./ConsentCard.tsx";

export function ConsentCards({ name }: { name: string }) {
  const { data } = useConsent(name);
  if (!data?.length) return null;
  return <>{data.map((c) => <ConsentCard key={c.id} name={name} card={c} />)}</>;
}

// For a section host: the open project's cards.
export function OpenConsentCards() {
  const name = useStudio((s) => s.name);
  return name ? <ConsentCards name={name} /> : null;
}

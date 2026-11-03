// A component whose module loads the first time it renders, so a tab or section nobody opens adds
// nothing to the page-open bundle. Extensions register it like any component; the hosts
// (LeftPanel, SectionHost, InspectorHost, AgentDialog) show TabFallback while it loads.
//   const AnimeTab = lazyNamed(() => import("./AnimeTab.tsx"), "AnimeTab");
// Whatever else index.ts needs at once (a lead text, a badge hook) must come from another file:
// a module imported both ways stays in the page-open bundle.
import { lazy, type ComponentType } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<M extends Record<K, ComponentType<any>>, K extends keyof M>(load: () => Promise<M>, key: K) {
  return lazy(() => load().then((m) => ({ default: m[key] })));
}

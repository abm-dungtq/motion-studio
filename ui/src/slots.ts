// The layout slots: every place an area's component shows up has one name, and the element that
// hosts it carries data-slot="<name>".
// - rail: the 52 px icon column (registerTab).
// - left: the left panel (the open tab's component, then useSections(tabId)).
// - stage: the black preview stage (shell/Stage.tsx).
// - right.director: the director tab of the right column (registerSection("director", …)).
// - right.shot: the shot tab, the inspector (registerInspectorSection).
// - export: the export dialog (registerSection("export", …)).
// - agent: the agent dialog (registerAgentRows).
// - timeline: the bottom row (ui/src/timeline/index.tsx, export TimelineArea).
export const SLOTS = ["rail", "left", "stage", "right.director", "right.shot", "export", "agent", "timeline"] as const;
export type SlotName = (typeof SLOTS)[number];

// The component registry that replaces studio.addTab / addSection / addInspectorSection /
// addAgentRows / addTimelineDecorator of the old UI (public/app.js:455-466, panels.js:366-382,
// docs/extensions.md). Built-in panels (ui/src/panels/*) and extensions (ui/src/ext/*) both register
// here from their index.ts register(studio); ext/load.ts finds and calls them.
import { useSyncExternalStore, type ComponentType } from "react";
import { bus } from "@/core/bus.ts";
import { actions } from "@/api/actions.ts";
import { api, say, send } from "@/api/client.ts";
import type { AgentStatus, Manifest } from "@/api/types.ts";
import type { Pick, PickKind } from "@/store/studio.ts";
import { useStudio } from "@/store/studio.ts";

export type TabGroup = "assets" | "audio" | "library" | "extra";
export const TAB_GROUPS: readonly TabGroup[] = ["assets", "audio", "library", "extra"];
const TAB_ID = /^[a-z][a-z0-9-]{1,30}$/;
// "ai" became the director tab of the right column, "output" the export dialog.
const RESERVED = new Set(["ai", "output"]);

export interface TabDef {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean }>;
  group?: TabGroup;
  order?: number;
  lead?: string;
  component: ComponentType;
  // A count for the rail badge (hidden at 0). Called while its rail button renders, so it may
  // use hooks (useProject, useRequests…); keep the hook calls the same on every render.
  badge?: () => number;
}
export interface Tab extends Required<Omit<TabDef, "badge">> { badge?: () => number; seq: number }

export interface SectionDef { id: string; order?: number; component: ComponentType }
export interface Section { id: string; order: number; component: ComponentType; seq: number }

export interface InspectorSectionProps { pick: NonNullable<Pick>; m: Manifest | null }
export interface InspectorSectionDef { id?: string; kinds?: PickKind[]; order?: number; component: ComponentType<InspectorSectionProps> }
export interface InspectorSection { id: string; kinds: PickKind[]; order: number; component: ComponentType<InspectorSectionProps>; seq: number }

// What an agent row gets: GET /api/agent (undefined until the first answer), its error, and a reload.
export interface AgentRowProps { data: AgentStatus | undefined; error: Error | null; reload: () => void }
export interface AgentRowsDef { component: ComponentType<AgentRowProps>; width?: string }

export interface DecoBand { t: number; until?: number | null; lane: "shot" | "voice" | "music" | "sfx"; label: string; kind: "info" | "warn" | "bad" | "ok" | string }
export type TimelineDecorator = (m: Manifest, state: { name: string | null; sel: string | null; pick: Pick }) => DecoBand[] | null | undefined;

let seq = 0;
let version = 0;
let tabs: Tab[] = [];
let sections: Record<string, Section[]> = {};
let inspector: InspectorSection[] = [];
let agentRows: (AgentRowsDef & { seq: number })[] = [];
let decorators: TimelineDecorator[] = [];
const listeners = new Set<() => void>();
const changed = () => { version++; for (const fn of listeners) fn(); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const useVersion = () => useSyncExternalStore(subscribe, () => version, () => version);

// A function component, or a memo / forwardRef object.
const isComponent = (c: unknown): boolean => typeof c === "function" || (typeof c === "object" && c !== null);
const byOrder = <T extends { order: number; seq: number }>(a: T, b: T) => a.order - b.order || a.seq - b.seq;

export function registerTab(def: TabDef): { id: string } {
  const id = String(def?.id);
  if (!TAB_ID.test(id) || tabs.some((t) => t.id === id)) throw new Error(`registerTab: id "${id}" không hợp lệ hoặc đã có`);
  if (RESERVED.has(id)) throw new Error(`registerTab: id "${id}" đã dành cho chỗ khác`);
  if (!def.label || !isComponent(def.component)) throw new Error(`registerTab ${id}: cần label và component`);
  const group = TAB_GROUPS.includes(def.group as TabGroup) ? (def.group as TabGroup) : "extra";
  tabs = [...tabs, { id, label: def.label, icon: def.icon, group, order: Number(def.order ?? 100) || 0, lead: def.lead ?? "", component: def.component, badge: def.badge, seq: ++seq }];
  changed();
  return { id };
}

// hostId: a tab id, "director" (the right column's director tab) or "export" (the export dialog).
export function registerSection(hostId: string, def: SectionDef): void {
  if (!def || !isComponent(def.component)) throw new Error(`registerSection ${hostId}/${def?.id}: cần component`);
  const list = [...(sections[hostId] ?? []), { id: def.id, order: Number(def.order ?? 100) || 0, component: def.component, seq: ++seq }].sort(byOrder);
  sections = { ...sections, [hostId]: list };
  changed();
}

export function registerInspectorSection(def: InspectorSectionDef): void {
  if (!def || !isComponent(def.component)) throw new Error(`registerInspectorSection ${def?.id ?? ""}: cần component`);
  const s = ++seq;
  inspector = [...inspector, { id: def.id ?? `section-${s}`, kinds: def.kinds?.length ? [...def.kinds] : (["shot"] as PickKind[]), order: Number(def.order ?? 100) || 0, component: def.component, seq: s }].sort(byOrder);
  changed();
}

export function registerAgentRows(def: AgentRowsDef): void {
  if (!def || !isComponent(def.component)) throw new Error("registerAgentRows: cần component");
  agentRows = [...agentRows, { ...def, seq: ++seq }];
  changed();
}

export function registerTimelineDecorator(fn: TimelineDecorator): void {
  if (typeof fn !== "function") throw new Error("registerTimelineDecorator: cần một hàm");
  decorators = [...decorators, fn];
  changed();
}

// Tabs by group (assets, audio, library, extra), then order, then registration.
const sortedTabs = (): Tab[] => [...tabs].sort((a, b) => TAB_GROUPS.indexOf(a.group) - TAB_GROUPS.indexOf(b.group) || byOrder(a, b));
let tabsCache: { v: number; list: Tab[] } = { v: -1, list: [] };
export function getTabs(): Tab[] {
  if (tabsCache.v !== version) tabsCache = { v: version, list: sortedTabs() };
  return tabsCache.list;
}
export function useTabs(): Tab[] { useVersion(); return getTabs(); }

const EMPTY: never[] = [];
export const getSections = (hostId: string): Section[] => sections[hostId] ?? EMPTY;
export function useSections(hostId: string): Section[] { useVersion(); return getSections(hostId); }

export const getInspectorSections = (kind: PickKind): InspectorSection[] => inspector.filter((s) => s.kinds.includes(kind));
export function useInspectorSections(kind: PickKind | null | undefined): InspectorSection[] {
  useVersion();
  return kind ? getInspectorSections(kind) : EMPTY;
}

export function useAgentRows(): (AgentRowsDef & { seq: number })[] { useVersion(); return agentRows; }

export const getDecorators = (): TimelineDecorator[] => decorators;
export function useDecorators(): TimelineDecorator[] { useVersion(); return decorators; }

// What a panel's or an extension's register(studio) gets.
export interface Studio {
  registerTab: typeof registerTab;
  registerSection: typeof registerSection;
  registerInspectorSection: typeof registerInspectorSection;
  registerAgentRows: typeof registerAgentRows;
  registerTimelineDecorator: typeof registerTimelineDecorator;
  actions: typeof actions;
  api: typeof api;
  send: typeof send;
  toast: typeof say;
  useStudio: typeof useStudio;
  bus: typeof bus;
}

export function createStudio(): Studio {
  return { registerTab, registerSection, registerInspectorSection, registerAgentRows, registerTimelineDecorator, actions, api, send, toast: say, useStudio, bus };
}

// Tests only: forget everything registered.
export function resetRegistry(): void {
  tabs = []; sections = {}; inspector = []; agentRows = []; decorators = [];
  changed();
}

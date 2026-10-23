import { afterEach, describe, expect, it, vi } from "vitest";
import { Box } from "lucide-react";
import { say } from "@/api/client.ts";
import { loadAll } from "./load.ts";
import {
  createStudio, getDecorators, getInspectorSections, getSections, getTabs,
  registerAgentRows, registerInspectorSection, registerSection, registerTab, registerTimelineDecorator, resetRegistry,
} from "./registry.ts";

vi.mock("@/api/client.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client.ts")>()), say: vi.fn() }));

const C = () => null;
const tab = (id: string, group?: "assets" | "audio" | "library" | "extra", order?: number) => ({ id, label: id, icon: Box, group, order, component: C });

afterEach(() => { resetRegistry(); vi.mocked(say).mockClear(); });

describe("registry", () => {
  it("sorts tabs by group, then order, then registration", () => {
    registerTab(tab("library", "library", 10));
    registerTab(tab("music", "audio", 20));
    registerTab(tab("voice", "audio", 10));
    registerTab(tab("fx", "assets", 40));
    registerTab(tab("media", "assets", 10));
    registerTab(tab("other"));
    expect(getTabs().map((t) => t.id)).toEqual(["media", "fx", "voice", "music", "library", "other"]);
    expect(getTabs().at(-1)?.group).toBe("extra");
  });

  it("rejects bad, duplicate and reserved tab ids, and a tab without a component", () => {
    expect(() => registerTab(tab("X"))).toThrow(/không hợp lệ/);
    expect(() => registerTab(tab("a"))).toThrow(/không hợp lệ/);
    registerTab(tab("media"));
    expect(() => registerTab(tab("media"))).toThrow(/đã có/);
    expect(() => registerTab(tab("ai"))).toThrow(/dành cho chỗ khác/);
    expect(() => registerTab(tab("output"))).toThrow(/dành cho chỗ khác/);
    expect(() => registerTab({ ...tab("voice"), component: undefined as never })).toThrow(/cần label và component/);
  });

  it("keeps sections per host in order", () => {
    registerSection("export", { id: "b", order: 20, component: C });
    registerSection("export", { id: "a", order: 10, component: C });
    registerSection("director", { id: "d", component: C });
    expect(getSections("export").map((s) => s.id)).toEqual(["a", "b"]);
    expect(getSections("director").map((s) => s.id)).toEqual(["d"]);
    expect(getSections("none")).toEqual([]);
    expect(() => registerSection("export", { id: "x", component: null as never })).toThrow();
  });

  it("inspector sections default to the shot kind", () => {
    registerInspectorSection({ id: "one", component: C });
    registerInspectorSection({ id: "two", kinds: ["line", "shot"], order: 5, component: C });
    expect(getInspectorSections("shot").map((s) => s.id)).toEqual(["two", "one"]);
    expect(getInspectorSections("line").map((s) => s.id)).toEqual(["two"]);
    expect(getInspectorSections("music")).toEqual([]);
  });

  it("agent rows need a component; decorators need a function", () => {
    expect(() => registerAgentRows({ component: undefined as never })).toThrow();
    const deco = () => [];
    registerTimelineDecorator(deco);
    expect(getDecorators()).toEqual([deco]);
    expect(() => registerTimelineDecorator("x" as never)).toThrow();
  });

  it("createStudio hands the register functions and the shared helpers", () => {
    const s = createStudio();
    for (const k of ["registerTab", "registerSection", "registerInspectorSection", "registerAgentRows", "registerTimelineDecorator", "api", "send", "toast", "useStudio"] as const) expect(typeof s[k]).toBe("function");
    expect(typeof s.bus.on).toBe("function");
    expect(typeof s.actions.open).toBe("function");
  });
});

describe("loadAll", () => {
  it("loads panels before extensions, by folder name, and skips a broken one with one toast", async () => {
    const order: string[] = [];
    const mod = (id: string) => ({ register: () => { order.push(id); } });
    const r = await loadAll(createStudio(), {
      panels: { "../panels/voice/index.ts": mod("voice"), "../panels/media/index.ts": mod("media") },
      ext: { "./lemo/index.ts": { register: () => { throw new Error("hỏng"); } }, "./anime/index.ts": mod("anime"), "./fx/index.ts": {} },
    });
    expect(order).toEqual(["media", "voice", "anime"]);
    expect(r.loaded).toEqual(["media", "voice", "anime"]);
    expect(r.failed).toEqual(["fx: không có export register(studio)", "lemo: hỏng"]);
    expect(say).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith("Extension lỗi, đã bỏ qua: fx: không có export register(studio); lemo: hỏng", true);
  });

  it("finds no folders yet with the real globs", async () => {
    const r = await loadAll(createStudio());
    expect(r.failed).toEqual([]);
  });
});

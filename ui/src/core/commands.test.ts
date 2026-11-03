import { describe, expect, it, vi } from "vitest";
import { buildCommands, type CommandContext } from "./commands.ts";

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    projects: [{ name: "a-01", has_manifest: true }, { name: "a-02", has_manifest: true }, { name: "cu", has_manifest: false }],
    recent: ["a-02"],
    shots: [{ id: "s1", start: 0 }, { id: "s2", start: 4 }, { id: "s3", start: 9.5 }],
    editable: true,
    leftTabs: [{ id: "styles", label: "Phong cách" }, { id: "media", label: "Chất liệu" }],
    openNotes: 0,
    run: {
      open: vi.fn(), newProject: vi.fn(), leftTab: vi.fn(), rightTab: vi.fn(), shot: vi.fn(), undo: vi.fn(), redo: vi.fn(),
      exportVideo: vi.fn(), recheckGates: vi.fn(), jobs: vi.fn(), toggleQa: vi.fn(), sendNotes: vi.fn(),
    },
    ...over,
  };
}

const find = (list: ReturnType<typeof buildCommands>, label: string) => {
  const c = list.find((x) => x.label === label);
  if (!c) throw new Error(`no command ${label}: ${list.map((x) => x.label).join(", ")}`);
  return c;
};

describe("buildCommands", () => {
  it("has a command per shot that selects it at its start", () => {
    const c = ctx();
    const list = buildCommands(c);
    void find(list, "Tới shot 3 · s3").run();
    expect(c.run.shot).toHaveBeenCalledWith("s3", 9.5);
  });

  it("runs the export gate check again", () => {
    const c = ctx();
    void find(buildCommands(c), "Kiểm lại cổng xuất").run();
    expect(c.run.recheckGates).toHaveBeenCalled();
  });

  it("lists the tabs from the registry and the right column, and opens the right one", () => {
    const c = ctx();
    const list = buildCommands(c);
    void find(list, "Đi tới tab Phong cách").run();
    void find(list, "Đi tới tab Shot").run();
    expect(c.run.leftTab).toHaveBeenCalledWith("styles");
    expect(c.run.rightTab).toHaveBeenCalledWith("shot");
  });

  it("opens only imported projects, the recent ones first", () => {
    const labels = buildCommands(ctx()).filter((x) => x.id.startsWith("open:")).map((x) => x.label);
    expect(labels).toEqual(["Mở dự án: a-02", "Mở dự án: a-01"]);
  });

  it("turns undo and redo off when the project is read-only", () => {
    const list = buildCommands(ctx({ editable: false }));
    expect(find(list, "Hoàn tác").enabled?.()).toBe(false);
    expect(find(list, "Làm lại").keys).toBe("⌘⇧Z");
    expect(find(buildCommands(ctx()), "Hoàn tác").enabled?.()).toBe(true);
  });

  it("offers to send the notes only when some are open", () => {
    expect(buildCommands(ctx()).some((x) => x.id === "notes:send")).toBe(false);
    const c = ctx({ openNotes: 2 });
    void find(buildCommands(c), "Giao đạo diễn sửa 2 ghi chú").run();
    expect(c.run.sendNotes).toHaveBeenCalled();
  });
});

import { screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { actions } from "@/api/actions.ts";
import { queryClient } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import type { Manifest } from "@/api/types.ts";
import { registerInspectorSection } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { InspectorHost } from "./InspectorHost.tsx";
import { mockFetch, renderUi } from "./test-utils.tsx";

describe("InspectorHost", () => {
  it("asks for a pick when nothing is picked", () => {
    mockFetch({});
    renderUi(<InspectorHost />);
    expect(screen.getByText("Chọn một khối trên timeline")).toBeInTheDocument();
  });

  it("lists the shots without a pick; a button picks its shot", async () => {
    const m = { version: 1, lines: [], shots: [{ id: "s1", start: 0, end: 2 }, { id: "s2", name: "Kết", start: 2, end: 4 }] } as unknown as Manifest;
    mockFetch({ "/api/project": m });
    queryClient.setQueryData(Q.keys.project("p"), m);
    const select = vi.spyOn(actions, "select").mockImplementation(() => {});
    useStudio.setState({ name: "p", pick: null });
    renderUi(<InspectorHost />);
    expect(await screen.findByRole("button", { name: "Shot 1 · s1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Shot 2 · Kết" }));
    expect(select).toHaveBeenCalledWith("s2");
  });

  it("a section that throws shows the extension error and the others still render", () => {
    mockFetch({ "/api/project": { shots: [{ id: "s1", start: 0, dur: 2 }] } });
    registerInspectorSection({ id: "ok-a", order: 1, component: () => <p>mục một</p> });
    registerInspectorSection({ id: "broken", order: 2, component: () => { throw new Error("hỏng"); } });
    registerInspectorSection({ id: "ok-b", order: 3, component: () => <p>mục ba</p> });
    useStudio.setState({ name: "p", pick: { kind: "shot", id: "s1" } });
    renderUi(<InspectorHost />);
    expect(document.querySelector('[data-section="inspector/broken"]')?.textContent).toBe("Mục mở rộng lỗi: hỏng");
    expect(screen.getByText("mục một")).toBeInTheDocument();
    expect(screen.getByText("mục ba")).toBeInTheDocument();
  });
});

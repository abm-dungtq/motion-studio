import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

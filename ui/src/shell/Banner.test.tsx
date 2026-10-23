import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { Banner } from "./Banner.tsx";
import { renderUi } from "./test-utils.tsx";

const projects = [
  { name: "new-one", has_manifest: false, editable: false },
  { name: "old-one", has_manifest: true, editable: false },
  { name: "ok-one", has_manifest: true, editable: true },
];

function setup(name: string | null, m?: unknown) {
  queryClient.setQueryData(keys.projects(), projects);
  if (name && m) queryClient.setQueryData(keys.project(name), m);
  useStudio.setState({ name });
  return renderUi(<Banner />);
}

describe("Banner", () => {
  it("without a provider: the error in bold and the setup command", () => {
    useStudio.setState({ providerStatus: { ok: false, error: "Thiếu hyperframes.", setup: "npm run setup" } });
    const { container } = setup(null);
    expect(container.querySelector("strong")).toHaveTextContent("Thiếu hyperframes.");
    expect(screen.getByRole("status")).toHaveTextContent("Chạy npm run setup trong thư mục Motion Studio, rồi tải lại trang.");
  });

  it("a project without project.json offers the import", () => {
    setup("new-one");
    expect(screen.getByRole("status")).toHaveTextContent("Dự án chưa có project.json.");
    expect(screen.getByRole("button", { name: "Nhập dự án" })).toBeInTheDocument();
  });

  it("a read-only project says so", () => {
    setup("old-one", { version: 1, capabilities: { editable: false } });
    expect(screen.getByRole("status")).toHaveTextContent("Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn");
  });

  it("is hidden for an editable project", () => {
    setup("ok-one", { version: 1, capabilities: { editable: true } });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

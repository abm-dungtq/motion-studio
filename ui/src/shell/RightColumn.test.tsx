import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { RightColumn } from "./RightColumn.tsx";
import { mockFetch, renderUi } from "./test-utils.tsx";

function setup(status: string) {
  const requests = [{ id: "r1", status }];
  mockFetch({ "/api/requests": requests });
  queryClient.setQueryData(keys.requests("demo"), requests);
  useStudio.setState({ name: "demo" });
  return renderUi(<RightColumn />);
}

describe("RightColumn", () => {
  it("dots the director tab while a card waits for the user", () => {
    setup("waiting_user");
    expect(screen.getByLabelText("Có thẻ đang chờ bạn")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="right.director"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="right.shot"]')).not.toBeNull();
  });

  it("has no dot otherwise, and the Shot tab without a pick asks for one", () => {
    setup("running");
    expect(screen.queryByLabelText("Có thẻ đang chờ bạn")).toBeNull();
    expect(screen.getByText("Chọn một khối trên timeline")).toBeInTheDocument();
  });
});

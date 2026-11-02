import { renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NarrowNotice } from "./NarrowNotice.tsx";

const media = (matches: boolean) => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })));

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("narrow window notice", () => {
  it("says the layout needs 1280 px; Ẩn hides it for the session", () => {
    media(true);
    const { unmount } = renderUi(<NarrowNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("1280 px");
    fireEvent.click(screen.getByRole("button", { name: "Ẩn" }));
    expect(screen.queryByText(/1280 px/)).toBeNull();
    unmount();
    renderUi(<NarrowNotice />);
    expect(screen.queryByText(/1280 px/)).toBeNull();
  });

  it("shows nothing on a wide window", () => {
    media(false);
    renderUi(<NarrowNotice />);
    expect(screen.queryByText(/1280 px/)).toBeNull();
  });
});

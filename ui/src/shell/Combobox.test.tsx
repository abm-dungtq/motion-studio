import "./test-utils.tsx";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { onTimelineKey } from "@/timeline/keys.ts";
import { Combobox, filterOptions, type Option } from "./Combobox.tsx";

const OPTS: Option[] = [
  { value: "ink", label: "Mực màu", group: "Dựng sẵn" },
  { value: "race", label: "Đường đua", group: "lemo" },
  { value: "news", label: "Tin tức", group: "lemo" },
  ...Array.from({ length: 8 }, (_, i) => ({ value: `x${i}`, label: `Mẫu ${i}`, group: "Của bạn" })),
];

function Harness({ onChange, options = OPTS }: { onChange: (v: string) => void; options?: Option[] }) {
  const [v, setV] = useState<string | null>("ink");
  return <Combobox label="Phong cách" value={v} options={options} onChange={(x) => { setV(x); onChange(x); }} />;
}

const open = () => fireEvent.click(screen.getByRole("combobox", { name: "Phong cách" }));

describe("filterOptions", () => {
  it("ignores case and Vietnamese marks", () => {
    expect(filterOptions(OPTS, "mau").map((o) => o.value)).toContain("ink");
    expect(filterOptions(OPTS, "dd").map((o) => o.value)).toEqual(["race"]);
    expect(filterOptions(OPTS, "ĐƯỜNG").map((o) => o.value)).toEqual(["race"]);
    expect(filterOptions(OPTS, "  ")).toBe(OPTS);
  });
});

describe("Combobox", () => {
  it("shows the chosen label and the ARIA of a combobox", () => {
    render(<Harness onChange={() => {}} />);
    const b = screen.getByRole("combobox", { name: "Phong cách" });
    expect(b).toHaveTextContent("Mực màu");
    expect(b).toHaveAttribute("aria-haspopup", "listbox");
    expect(b).toHaveAttribute("aria-expanded", "false");
  });

  it("types, moves down, chooses with Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    open();
    const search = screen.getByRole("searchbox", { name: "Tìm trong Phong cách" });
    fireEvent.change(search, { target: { value: "tin" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.change(search, { target: { value: "mau" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(search.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1]!.id);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("x0");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Phong cách" })).toHaveTextContent("Mẫu 0");
  });

  it("groups options with labelled groups", () => {
    render(<Harness onChange={() => {}} />);
    open();
    expect(screen.getByRole("group", { name: "lemo" })).toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(3);
  });

  it("moving with the arrows never calls onChange; a click does", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    open();
    const search = screen.getByRole("searchbox");
    for (const key of ["ArrowDown", "ArrowDown", "End", "Home", "ArrowUp"]) fireEvent.keyDown(search, { key });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: "Tin tức" }));
    expect(onChange).toHaveBeenCalledWith("news");
  });

  it("Escape closes and gives focus back to the button", async () => {
    render(<Harness onChange={() => {}} />);
    open();
    const search = screen.getByRole("searchbox");
    search.focus();
    await act(async () => { fireEvent.keyDown(search, { key: "Escape" }); });
    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Phong cách" })));
  });

  it("without a search field the listbox takes the keys and marks the chosen option", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} options={OPTS.slice(0, 3)} />);
    open();
    expect(screen.queryByRole("searchbox")).toBeNull();
    const lb = screen.getByRole("listbox");
    expect(screen.getByRole("option", { name: "Mực màu" })).toHaveAttribute("aria-selected", "true");
    expect(lb.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Mực màu" }).id);
    fireEvent.keyDown(lb, { key: "ArrowDown" });
    fireEvent.keyDown(lb, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("race");
  });

  it("a disabled option is not chosen", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} options={[{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }]} />);
    open();
    fireEvent.click(screen.getByRole("option", { name: "B" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("timeline shortcuts do not run from the button or an option", () => {
    render(<Harness onChange={() => {}} options={OPTS.slice(0, 3)} />);
    const fit = vi.fn();
    const button = screen.getByRole("combobox", { name: "Phong cách" });
    for (const key of [" ", "ArrowLeft", "ArrowDown", "Home"]) {
      const e = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true });
      button.dispatchEvent(e);
      onTimelineKey(e, fit);
      expect(e.defaultPrevented).toBe(false);
    }
    open();
    const opt = screen.getByRole("option", { name: "Tin tức" });
    const e = new KeyboardEvent("keydown", { key: " ", cancelable: true, bubbles: true });
    opt.dispatchEvent(e);
    onTimelineKey(e, fit);
    expect(e.defaultPrevented).toBe(false);
    expect(fit).not.toHaveBeenCalled();
  });
});

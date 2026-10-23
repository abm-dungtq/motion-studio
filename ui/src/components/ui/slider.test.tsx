import "@/shell/test-utils.tsx";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Slider } from "./slider.tsx";

describe("Slider", () => {
  it("names the thumb with aria-label", () => {
    render(<Slider aria-label="Âm lượng bgm.mp3" value={[20]} max={100} />);
    expect(screen.getByRole("slider", { name: "Âm lượng bgm.mp3" })).toBeInTheDocument();
  });
});

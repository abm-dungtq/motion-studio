import { describe, expect, it } from "vitest";
import { bodyOf, DEFAULTS, folderOf, nameProblem } from "./new-project.ts";

describe("folderOf", () => {
  it("turns a typed Vietnamese name into a folder name", () => {
    expect(folderOf("Video Thử 2")).toBe("video-thu-2");
    expect(folderOf("  Đường về nhà!! ")).toBe("duong-ve-nha");
    expect(folderOf("abm-intro")).toBe("abm-intro");
  });

  it("keeps at most 49 characters and no trailing dash", () => {
    const f = folderOf(`${"a".repeat(48)} b`);
    expect(f).toBe("a".repeat(48));
  });
});

describe("nameProblem", () => {
  it("says what is wrong in Vietnamese", () => {
    expect(nameProblem("")).toMatch(/^Nhập tên thư mục/);
    expect(nameProblem("!!")).toMatch(/^Nhập tên thư mục/);
    expect(nameProblem("a")).toMatch(/ít nhất 2 ký tự/);
    expect(nameProblem("Video Thu")).toBeNull();
  });
});

it("bodyOf sends the folder name", () => {
  const body = bodyOf({ name: "Video Thu", mode: DEFAULTS.mode, aspect: DEFAULTS.aspect, topic: "x", duration: "30", audience: "", first_request: "" });
  expect(body.name).toBe("video-thu");
});

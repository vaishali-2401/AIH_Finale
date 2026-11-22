import { describe, expect, it } from "vitest";
import { cn, documentName, formatBytes, formatRelativeTime } from "../format";

describe("format helpers", () => {
  it("cn joins truthy class names", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(88 * 1024)).toBe("88 KB");
    expect(formatBytes(5.25 * 1024 * 1024)).toBe("5.3 MB");
  });

  it("prefers the extracted title, else the filename without .pdf", () => {
    expect(documentName({ title: "A Culinary Journey", filename: "cuisine.pdf" })).toBe("A Culinary Journey");
    expect(documentName({ title: null, filename: "South of France - Cities.PDF" })).toBe(
      "South of France - Cities",
    );
  });

  it("formats recent times relatively", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toMatch(/5 minutes ago/);
  });
});

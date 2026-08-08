import { describe, expect, it } from "vitest";
import { defaultEngineeringOptions, withOtherOption } from "@/lib/engineeringConfig";

describe("defaultEngineeringOptions", () => {
  it("includes real branches for each default course (not only Other)", () => {
    const defaults = defaultEngineeringOptions();
    for (const course of defaults.courses) {
      if (course === "Other") continue;
      const branches = withOtherOption(
        (defaults.branches_by_course[course] || []).filter((b) => b !== "Other")
      );
      expect(branches.some((b) => b !== "Other")).toBe(true);
      expect(branches.every((b) => b === "Other")).toBe(false);
    }
  });
});

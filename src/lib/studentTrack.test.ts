import { describe, expect, it } from "vitest";
import {
  departmentsForNonTechDegree,
  filterNonEngineeringCoursesForDegree,
  departmentMatchesNonTechDegree,
} from "@/lib/studentTrack";

describe("non-tech degree departments", () => {
  it("returns only UG departments for UG", () => {
    expect(departmentsForNonTechDegree("UG")).toEqual(["B.A.", "B.Sc", "B.Com"]);
  });

  it("returns only PG departments for PG", () => {
    expect(departmentsForNonTechDegree("PG")).toEqual(["M.A.", "M.Sc", "M.Com"]);
  });

  it("returns empty list when degree not selected", () => {
    expect(departmentsForNonTechDegree("")).toEqual([]);
  });

  it("filters configured courses by degree", () => {
    const all = ["B.A.", "B.Sc", "M.A.", "M.Sc", "Other"];
    expect(filterNonEngineeringCoursesForDegree("UG", all)).toEqual(["B.A.", "B.Sc"]);
    expect(filterNonEngineeringCoursesForDegree("PG", all)).toEqual(["M.A.", "M.Sc"]);
  });

  it("validates department against degree", () => {
    expect(departmentMatchesNonTechDegree("UG", "B.Com")).toBe(true);
    expect(departmentMatchesNonTechDegree("UG", "M.Com")).toBe(false);
    expect(departmentMatchesNonTechDegree("PG", "M.A.")).toBe(true);
  });
});

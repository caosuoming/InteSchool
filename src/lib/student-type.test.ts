import { describe, expect, it } from "vitest";
import { studentTypeLabel, studentTypeOf } from "./student-type.js";

describe("student type compatibility", () => {
  it("infers the existing binary flag for legacy records", () => {
    expect(studentTypeOf({ isExternal: true })).toBe("visiting");
    expect(studentTypeLabel({ isExternal: false })).toBe("本校生");
  });

  it("preserves the explicit resumed type", () => {
    expect(studentTypeLabel({ studentType: "resumed", isExternal: false })).toBe("复学生");
  });
});

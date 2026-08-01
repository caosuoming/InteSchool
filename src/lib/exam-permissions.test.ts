import { describe, expect, it } from "vitest";
import { canManageSchoolExams } from "./exam-permissions";

const teacher = {
  role: "teacher" as const,
  roles: ["teacher" as const],
};

function affiliation(
  role: "teacher" | "school_admin" | "platform_admin" = "teacher",
  roles: Array<"teacher" | "gradeLeader" | "dean" | "vicePrincipal" | "principal"> = ["teacher"],
  schoolId: string | null = "school-1",
) {
  return { role, roles, schoolId };
}

describe("exam manager permissions", () => {
  it.each(["gradeLeader", "dean", "vicePrincipal", "principal"] as const)(
    "allows the %s role",
    (role) => {
      expect(canManageSchoolExams(teacher, affiliation("teacher", [role]))).toBe(true);
    },
  );

  it("allows school and platform administrators", () => {
    expect(canManageSchoolExams(teacher, affiliation("school_admin"))).toBe(true);
    expect(canManageSchoolExams(teacher, affiliation("platform_admin"))).toBe(true);
  });

  it("rejects ordinary teachers and personal identities", () => {
    expect(canManageSchoolExams(teacher, affiliation())).toBe(false);
    expect(canManageSchoolExams(
      { role: "teacher", roles: ["principal"] },
      affiliation("teacher", ["principal"], null),
    )).toBe(false);
  });
});

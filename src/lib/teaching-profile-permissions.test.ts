import { describe, expect, it } from "vitest";
import { canManageTeachingProfiles } from "./teaching-profile-permissions";

function subject(role = "teacher", roles: string[] = ["teacher"], schoolId: string | null = "school-1") {
  const affiliation = {
    id: "aff-1",
    schoolId,
    role,
    roles,
    isCurrent: true,
  };
  return {
    teacher: {
      role,
      roles,
      affiliations: [affiliation],
      currentAffiliationId: "aff-1",
    },
    affiliation,
  };
}

describe("teaching profile permissions", () => {
  it.each(["gradeLeader", "dean", "vicePrincipal", "principal"])(
    "allows %s to manage teacher assignments",
    (managerRole) => {
      const { teacher, affiliation } = subject("teacher", ["teacher", managerRole]);
      expect(canManageTeachingProfiles(teacher, affiliation)).toBe(true);
    },
  );

  it.each(["school_admin", "platform_admin"])("allows the %s account role", (role) => {
    const { teacher, affiliation } = subject(role, ["teacher"]);
    expect(canManageTeachingProfiles(teacher, affiliation)).toBe(true);
  });

  it("denies ordinary teachers and personal affiliations", () => {
    const ordinary = subject();
    const personal = subject("teacher", ["teacher", "principal"], null);
    expect(canManageTeachingProfiles(ordinary.teacher, ordinary.affiliation)).toBe(false);
    expect(canManageTeachingProfiles(personal.teacher, personal.affiliation)).toBe(false);
  });
});

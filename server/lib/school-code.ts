import { randomUUID } from "node:crypto";

export function generateSchoolCode(
  schools: readonly { code: string }[],
  applications: readonly { code: string; status?: string }[],
): string {
  const existing = new Set([
    ...schools.map((school) => school.code.trim().toUpperCase()),
    ...applications.filter((application) => application.status === "pending")
      .map((application) => application.code.trim().toUpperCase()),
  ]);
  let code: string;
  do {
    code = `SCH-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  } while (existing.has(code));
  return code;
}

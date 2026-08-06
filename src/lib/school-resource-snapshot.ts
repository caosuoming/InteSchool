import type { SchoolResourceBackup } from "@/types";

export function parseSchoolResourceSnapshot<T>(backup: SchoolResourceBackup): T | null {
  try {
    return JSON.parse(backup.contentSnapshot) as T;
  } catch {
    return null;
  }
}

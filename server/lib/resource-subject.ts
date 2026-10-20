import type { AppState, TeacherRecord } from "../types.js";

/** Older resources did not persist their subject. Assign them to the first approved subject. */
export function resourceSubject(state: AppState, resource: Record<string, unknown>): string {
  if (typeof resource.subject === "string" && resource.subject.trim()) return resource.subject.trim();
  const owner = state.teachers.find((teacher) => teacher.id === resource.teacherId);
  if (!owner) return "";
  const affiliations = owner.affiliations || [];
  const affiliation = affiliations.find((item) => item.schoolId === resource.schoolId)
    || affiliations.find((item) => item.id === owner.currentAffiliationId);
  const subjects = affiliation?.subjects;
  if (Array.isArray(subjects) && subjects.length && typeof subjects[0] === "string") return subjects[0];
  return String(affiliation?.subject || owner.subject || "");
}

export function selectedSubject(teacher: TeacherRecord): string {
  const affiliations = teacher.affiliations || [];
  const affiliation = affiliations.find((item) => item.id === teacher.currentAffiliationId)
    || affiliations.find((item) => item.isCurrent);
  if (!affiliation?.schoolId) return "";
  return String(affiliation.subject || teacher.subject || "");
}

export const SUBJECT_RESOURCE_COLLECTIONS = [
  "questions", "examPapers", "lectures", "coursewares", "materials", "resourceFolders", "baskets",
] as const;

export function tagNewPersonalResources(state: AppState, teacher: TeacherRecord, before: Map<string, Set<string>>): void {
  const subject = selectedSubject(teacher);
  if (!subject) return;
  for (const collection of SUBJECT_RESOURCE_COLLECTIONS) {
    const existing = before.get(collection);
    const resources = state[collection];
    if (!existing || !Array.isArray(resources)) continue;
    for (const resource of resources as Record<string, unknown>[]) {
      if (resource.teacherId === teacher.id && typeof resource.id === "string" && !existing.has(resource.id)) resource.subject = subject;
    }
  }
}

export function captureResourceIds(state: AppState): Map<string, Set<string>> {
  return new Map(SUBJECT_RESOURCE_COLLECTIONS.map((collection) => [collection,
    new Set(((state[collection] || []) as Array<{ id: string }>).map((item) => item.id)),
  ]));
}

export function filterPersonalResources<T extends Record<string, unknown>>(
  state: AppState, teacher: TeacherRecord, resources: T[],
): T[] {
  const subject = selectedSubject(teacher);
  if (!subject) return resources;
  return resources.filter((resource) => resource.teacherId !== teacher.id || resourceSubject(state, resource) === subject);
}

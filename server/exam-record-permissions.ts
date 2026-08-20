interface ExamRecordAffiliation {
  id?: unknown;
  isCurrent?: unknown;
  role?: unknown;
  schoolId?: unknown;
}

export interface ExamRecordActor {
  id: string;
  role: string;
  schoolId?: string | null;
  affiliations?: ExamRecordAffiliation[];
  currentAffiliationId?: string | null;
}

function activeExamActorAffiliation(actor: ExamRecordActor): ExamRecordAffiliation | undefined {
  return actor.affiliations?.find((item) => item.id === actor.currentAffiliationId)
    || actor.affiliations?.find((item) => item.isCurrent);
}

export function isExamRecordAdmin(actor: ExamRecordActor, schoolId?: string): boolean {
  const affiliation = activeExamActorAffiliation(actor);
  const role = typeof affiliation?.role === "string" ? affiliation.role : actor.role;
  if (role === "platform_admin") return true;
  if (role !== "school_admin") return false;
  if (!schoolId) return true;
  const actorSchoolId = typeof affiliation?.schoolId === "string" ? affiliation.schoolId : actor.schoolId;
  return actorSchoolId === schoolId;
}

export function canModifyExamRecord(
  ownerId: string,
  schoolId: string,
  actor: ExamRecordActor,
): boolean {
  return actor.id === ownerId || isExamRecordAdmin(actor, schoolId);
}

import type {
  ExamArrangementContext,
  TeachingScheduleConfig,
  TeachingScheduleHalfDay,
  TeachingScheduleSlotAssignment,
  TeachingScheduleSubjectRequirement,
  TeachingScheduleTeacherAssignment,
} from "../types/index.js";

export const TEACHING_SCHEDULE_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const TEACHING_SCHEDULE_PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;
export const TEACHING_SCHEDULE_DEFAULT_SUBJECTS = [
  "语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理",
] as const;

export interface TeachingScheduleUnscheduledItem {
  classId: string;
  subject: string;
  teacherName: string;
  remaining: number;
}

export interface TeachingScheduleGenerationResult {
  slots: Record<string, TeachingScheduleSlotAssignment>;
  unscheduled: TeachingScheduleUnscheduledItem[];
}

export interface TeachingScheduleTeacherStat {
  key: string;
  teacherId?: string;
  teacherName: string;
  subjects: string[];
  targetPeriods: number;
  currentPeriods: number;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

export function teachingScheduleTeacherKey(teacherId: string | undefined, teacherName: string): string {
  return teacherId || `name:${normalizedName(teacherName)}`;
}

export function teachingScheduleHalfDay(period: number): TeachingScheduleHalfDay {
  return period <= 4 ? "morning" : "afternoon";
}

export function teachingScheduleRequirementKey(day: number, halfDay: TeachingScheduleHalfDay): string {
  return `${day}-${halfDay}`;
}

export function teachingScheduleSlotKey(classId: string, day: number, period: number): string {
  return `${classId}:${day}:${period}`;
}

export function parseTeachingScheduleSlotKey(key: string): { classId: string; day: number; period: number } | null {
  const match = /^(.*):(\d+):(\d+)$/.exec(key);
  if (!match) return null;
  const day = Number(match[2]);
  const period = Number(match[3]);
  if (!TEACHING_SCHEDULE_WEEKDAYS.includes(day as (typeof TEACHING_SCHEDULE_WEEKDAYS)[number])) return null;
  if (!TEACHING_SCHEDULE_PERIODS.includes(period as (typeof TEACHING_SCHEDULE_PERIODS)[number])) return null;
  return { classId: match[1], day, period };
}

export function teachingScheduleSubjectRequirement(
  config: TeachingScheduleConfig,
  subject: string,
  day: number,
  halfDay: TeachingScheduleHalfDay,
): TeachingScheduleSubjectRequirement {
  return config.subjectRequirements[subject]?.[teachingScheduleRequirementKey(day, halfDay)] || "any";
}

export function buildDefaultTeachingScheduleConfig(context: ExamArrangementContext): TeachingScheduleConfig {
  const rosterSubjects = [...new Set((context.teachers || []).map((teacher) => teacher.subject.trim()).filter(Boolean))];
  const subjectNames = rosterSubjects.length > 0 ? rosterSubjects : [...TEACHING_SCHEDULE_DEFAULT_SUBJECTS];
  const assignments: TeachingScheduleTeacherAssignment[] = [];

  for (const teacher of context.teachers || []) {
    if (!teacher.name.trim() || !teacher.subject.trim()) continue;
    const classIds = (teacher.teachingClassIds || []).filter((classId) => context.cohort.classIds.includes(classId));
    for (const classId of classIds) {
      assignments.push({
        id: `roster:${teacher.id}:${classId}:${teacher.subject}`,
        classId,
        subject: teacher.subject,
        teacherName: teacher.name,
        teacherId: teacher.id,
      });
    }
  }

  return {
    assignments,
    subjects: subjectNames.map((subject) => ({ subject, weeklyPeriods: 0 })),
    subjectRequirements: {},
    teacherNotes: {},
    slots: {},
  };
}

function normalizedAssignment(
  assignment: TeachingScheduleTeacherAssignment,
  context: ExamArrangementContext,
): TeachingScheduleTeacherAssignment | null {
  const classExists = context.cohort.classIds.includes(assignment.classId);
  const subject = assignment.subject.trim();
  const teacherName = assignment.teacherName.trim();
  if (!classExists || !subject || !teacherName) return null;
  const rosterMatch = (context.teachers || []).find((teacher) => (
    teacher.id === assignment.teacherId
    || (normalizedName(teacher.name) === normalizedName(teacherName) && teacher.subject === subject)
  ));
  return {
    ...assignment,
    classId: assignment.classId,
    subject,
    teacherName,
    ...(rosterMatch?.id ? { teacherId: rosterMatch.id } : assignment.teacherId ? { teacherId: assignment.teacherId } : {}),
  };
}

export function normalizeTeachingScheduleConfig(
  config: TeachingScheduleConfig | null | undefined,
  context: ExamArrangementContext,
): TeachingScheduleConfig {
  if (!config) return buildDefaultTeachingScheduleConfig(context);
  const defaultConfig = buildDefaultTeachingScheduleConfig(context);
  const seenSubjects = new Set<string>();
  const subjects = (config.subjects || []).flatMap((item) => {
    const subject = item.subject.trim();
    if (!subject || seenSubjects.has(subject)) return [];
    seenSubjects.add(subject);
    return [{ subject, weeklyPeriods: Math.max(0, Math.min(35, Math.round(Number(item.weeklyPeriods) || 0))) }];
  });
  if (subjects.length === 0) subjects.push(...defaultConfig.subjects);

  const assignments = (config.assignments || [])
    .map((item) => normalizedAssignment(item, context))
    .filter((item): item is TeachingScheduleTeacherAssignment => Boolean(item));
  const subjectSet = new Set(subjects.map((item) => item.subject));
  for (const assignment of assignments) {
    if (!subjectSet.has(assignment.subject)) {
      subjects.push({ subject: assignment.subject, weeklyPeriods: 0 });
      subjectSet.add(assignment.subject);
    }
  }

  const subjectRequirements: TeachingScheduleConfig["subjectRequirements"] = Object.fromEntries(subjects.map(({ subject }) => {
    const source = config.subjectRequirements?.[subject] || {};
    const normalized: Record<string, TeachingScheduleSubjectRequirement> = Object.fromEntries(TEACHING_SCHEDULE_WEEKDAYS.flatMap((day) => (
      (["morning", "afternoon"] as const).map((halfDay) => {
        const key = teachingScheduleRequirementKey(day, halfDay);
        const value = source[key];
        return [key, value === "required" || value === "forbidden" ? value : "any"];
      })
    )));
    return [subject, normalized];
  }));

  const classIds = new Set(context.cohort.classIds);
  const slots = Object.fromEntries(Object.entries(config.slots || {}).flatMap(([key, value]) => {
    const parsed = parseTeachingScheduleSlotKey(key);
    if (!parsed || !classIds.has(parsed.classId)) return [];
    const subject = value.subject?.trim();
    const teacherName = value.teacherName?.trim();
    if (!subject || !teacherName) return [];
    const rosterMatch = (context.teachers || []).find((teacher) => (
      teacher.id === value.teacherId
      || (normalizedName(teacher.name) === normalizedName(teacherName) && teacher.subject === subject)
    ));
    return [[key, {
      subject,
      teacherName,
      ...(rosterMatch?.id ? { teacherId: rosterMatch.id } : value.teacherId ? { teacherId: value.teacherId } : {}),
      source: value.source === "manual" ? "manual" : "auto",
    } satisfies TeachingScheduleSlotAssignment]];
  }));

  return {
    assignments,
    subjects,
    subjectRequirements,
    teacherNotes: Object.fromEntries(Object.entries(config.teacherNotes || {})
      .map(([key, note]) => [key, String(note || "").trim()])
      .filter(([, note]) => Boolean(note))),
    slots,
  };
}

function teacherBusyAt(
  slots: Record<string, TeachingScheduleSlotAssignment>,
  teacherKey: string,
  day: number,
  period: number,
  ignoreKey?: string,
): boolean {
  return Object.entries(slots).some(([key, value]) => {
    if (key === ignoreKey) return false;
    const parsed = parseTeachingScheduleSlotKey(key);
    return Boolean(
      parsed
      && parsed.day === day
      && parsed.period === period
      && teachingScheduleTeacherKey(value.teacherId, value.teacherName) === teacherKey,
    );
  });
}

export function canPlaceTeachingScheduleAssignment(
  slots: Record<string, TeachingScheduleSlotAssignment>,
  key: string,
  value: TeachingScheduleSlotAssignment,
): boolean {
  const parsed = parseTeachingScheduleSlotKey(key);
  if (!parsed) return false;
  return !teacherBusyAt(
    slots,
    teachingScheduleTeacherKey(value.teacherId, value.teacherName),
    parsed.day,
    parsed.period,
    key,
  );
}

export function teachingScheduleSlotAllowedByRequirement(
  config: TeachingScheduleConfig,
  key: string,
  value: TeachingScheduleSlotAssignment,
): boolean {
  const parsed = parseTeachingScheduleSlotKey(key);
  if (!parsed) return false;
  return teachingScheduleSubjectRequirement(
    config,
    value.subject,
    parsed.day,
    teachingScheduleHalfDay(parsed.period),
  ) !== "forbidden";
}

interface Demand {
  classId: string;
  subject: string;
  teacherName: string;
  teacherId?: string;
  count: number;
}

function candidateSlots(
  config: TeachingScheduleConfig,
  demand: Demand,
  slots: Record<string, TeachingScheduleSlotAssignment>,
  requiredKey?: string,
): Array<{ key: string; day: number; period: number; score: number }> {
  const teacherKey = teachingScheduleTeacherKey(demand.teacherId, demand.teacherName);
  const candidates: Array<{ key: string; day: number; period: number; score: number }> = [];
  for (const day of TEACHING_SCHEDULE_WEEKDAYS) {
    for (const period of TEACHING_SCHEDULE_PERIODS) {
      const halfDay = teachingScheduleHalfDay(period);
      const requirementKey = teachingScheduleRequirementKey(day, halfDay);
      if (requiredKey && requirementKey !== requiredKey) continue;
      const requirement = teachingScheduleSubjectRequirement(config, demand.subject, day, halfDay);
      if (requirement === "forbidden") continue;
      const key = teachingScheduleSlotKey(demand.classId, day, period);
      if (slots[key] || teacherBusyAt(slots, teacherKey, day, period)) continue;
      const sameSubjectOnDay = TEACHING_SCHEDULE_PERIODS.filter((candidatePeriod) => (
        slots[teachingScheduleSlotKey(demand.classId, day, candidatePeriod)]?.subject === demand.subject
      )).length;
      const classLoadOnDay = TEACHING_SCHEDULE_PERIODS.filter((candidatePeriod) => (
        Boolean(slots[teachingScheduleSlotKey(demand.classId, day, candidatePeriod)])
      )).length;
      const preferredHalfDayBonus = requirement === "required" ? -40 : 0;
      const edgePenalty = period === 4 || period === 7 ? 1 : 0;
      candidates.push({
        key,
        day,
        period,
        score: sameSubjectOnDay * 100 + classLoadOnDay * 10 + preferredHalfDayBonus + edgePenalty + day + period / 10,
      });
    }
  }
  return candidates.sort((left, right) => left.score - right.score || left.key.localeCompare(right.key));
}

export function generateTeachingSchedule(config: TeachingScheduleConfig): TeachingScheduleGenerationResult {
  const slots: Record<string, TeachingScheduleSlotAssignment> = {};
  const hours = new Map(config.subjects.map((item) => [item.subject, Math.max(0, Math.round(item.weeklyPeriods))]));
  for (const [subject, weeklyPeriods] of hours) {
    const requiredCount = TEACHING_SCHEDULE_WEEKDAYS.reduce((count, day) => count
      + (["morning", "afternoon"] as const).filter((halfDay) => (
        teachingScheduleSubjectRequirement(config, subject, day, halfDay) === "required"
      )).length, 0);
    if (requiredCount > weeklyPeriods) {
      throw new Error(`“${subject}”每周只有 ${weeklyPeriods} 节，但配置三要求至少覆盖 ${requiredCount} 个半天`);
    }
  }
  const assignmentByClassSubject = new Map<string, TeachingScheduleTeacherAssignment>();
  for (const assignment of config.assignments) {
    const key = `${assignment.classId}\u0000${assignment.subject}`;
    if (!assignmentByClassSubject.has(key) && assignment.teacherName.trim()) assignmentByClassSubject.set(key, assignment);
  }
  const demands: Demand[] = [...assignmentByClassSubject.values()].flatMap((assignment) => {
    const count = hours.get(assignment.subject) || 0;
    return count > 0 ? [{
      classId: assignment.classId,
      subject: assignment.subject,
      teacherName: assignment.teacherName,
      teacherId: assignment.teacherId,
      count,
    }] : [];
  }).sort((left, right) => {
    const leftForbidden = TEACHING_SCHEDULE_WEEKDAYS.reduce((count, day) => count
      + (["morning", "afternoon"] as const).filter((halfDay) => teachingScheduleSubjectRequirement(config, left.subject, day, halfDay) === "forbidden").length, 0);
    const rightForbidden = TEACHING_SCHEDULE_WEEKDAYS.reduce((count, day) => count
      + (["morning", "afternoon"] as const).filter((halfDay) => teachingScheduleSubjectRequirement(config, right.subject, day, halfDay) === "forbidden").length, 0);
    return rightForbidden - leftForbidden || right.count - left.count || left.classId.localeCompare(right.classId) || left.subject.localeCompare(right.subject);
  });

  const unscheduled: TeachingScheduleUnscheduledItem[] = [];
  for (const demand of demands) {
    let remaining = demand.count;
    const requiredKeys = TEACHING_SCHEDULE_WEEKDAYS.flatMap((day) => (
      (["morning", "afternoon"] as const)
        .filter((halfDay) => teachingScheduleSubjectRequirement(config, demand.subject, day, halfDay) === "required")
        .map((halfDay) => teachingScheduleRequirementKey(day, halfDay))
    ));
    for (const requirementKey of requiredKeys) {
      if (remaining <= 0) break;
      const candidate = candidateSlots(config, demand, slots, requirementKey)[0];
      if (!candidate) continue;
      slots[candidate.key] = {
        subject: demand.subject,
        teacherName: demand.teacherName,
        ...(demand.teacherId ? { teacherId: demand.teacherId } : {}),
        source: "auto",
      };
      remaining -= 1;
    }
    for (const requirementKey of requiredKeys) {
      const satisfied = Object.entries(slots).some(([key, slot]) => {
        const parsed = parseTeachingScheduleSlotKey(key);
        return Boolean(
          parsed
          && parsed.classId === demand.classId
          && slot.subject === demand.subject
          && teachingScheduleRequirementKey(parsed.day, teachingScheduleHalfDay(parsed.period)) === requirementKey,
        );
      });
      if (!satisfied) {
        throw new Error(`“${demand.classId} / ${demand.subject}”无法满足配置三的必排时段，请检查教师冲突或时段限制`);
      }
    }
    while (remaining > 0) {
      const candidate = candidateSlots(config, demand, slots)[0];
      if (!candidate) break;
      slots[candidate.key] = {
        subject: demand.subject,
        teacherName: demand.teacherName,
        ...(demand.teacherId ? { teacherId: demand.teacherId } : {}),
        source: "auto",
      };
      remaining -= 1;
    }
    if (remaining > 0) {
      unscheduled.push({
        classId: demand.classId,
        subject: demand.subject,
        teacherName: demand.teacherName,
        remaining,
      });
    }
  }
  return { slots, unscheduled };
}

export function buildTeachingScheduleTeacherStats(config: TeachingScheduleConfig): TeachingScheduleTeacherStat[] {
  const subjectHours = new Map(config.subjects.map((item) => [item.subject, item.weeklyPeriods]));
  const byTeacher = new Map<string, TeachingScheduleTeacherStat>();
  for (const assignment of config.assignments) {
    const key = teachingScheduleTeacherKey(assignment.teacherId, assignment.teacherName);
    const current = byTeacher.get(key) || {
      key,
      teacherId: assignment.teacherId,
      teacherName: assignment.teacherName,
      subjects: [],
      targetPeriods: 0,
      currentPeriods: 0,
    };
    if (!current.subjects.includes(assignment.subject)) current.subjects.push(assignment.subject);
    current.targetPeriods += subjectHours.get(assignment.subject) || 0;
    byTeacher.set(key, current);
  }
  for (const slot of Object.values(config.slots)) {
    const key = teachingScheduleTeacherKey(slot.teacherId, slot.teacherName);
    const current = byTeacher.get(key) || {
      key,
      teacherId: slot.teacherId,
      teacherName: slot.teacherName,
      subjects: [slot.subject],
      targetPeriods: 0,
      currentPeriods: 0,
    };
    current.currentPeriods += 1;
    if (!current.subjects.includes(slot.subject)) current.subjects.push(slot.subject);
    byTeacher.set(key, current);
  }
  return [...byTeacher.values()].sort((left, right) => left.teacherName.localeCompare(right.teacherName, "zh-CN"));
}

export interface LotteryStudent {
  id: string;
  name: string;
}

export const STUDENT_LOTTERY_MIN_DURATION_MS = 3_000;
export const STUDENT_LOTTERY_MAX_DURATION_MS = 5_000;

export function studentLotteryDurationMs(random = Math.random): number {
  return STUDENT_LOTTERY_MIN_DURATION_MS
    + random() * (STUDENT_LOTTERY_MAX_DURATION_MS - STUDENT_LOTTERY_MIN_DURATION_MS);
}

export function eligibleLotteryStudents<T extends LotteryStudent>(
  students: readonly T[],
  ignoredStudentIds: ReadonlySet<string>,
  presetStudentIds: readonly string[] = [],
): T[] {
  const eligible = students.filter((student) => !ignoredStudentIds.has(student.id));
  if (presetStudentIds.length === 0) return eligible;
  const presetIds = new Set(presetStudentIds);
  return eligible.filter((student) => presetIds.has(student.id));
}

export function pickWeightedLotteryStudent<T extends LotteryStudent>(
  students: readonly T[],
  followedStudentIds: ReadonlySet<string>,
  random = Math.random,
): T | undefined {
  if (students.length === 0) return undefined;
  const totalWeight = students.reduce(
    (sum, student) => sum + (followedStudentIds.has(student.id) ? 2 : 1),
    0,
  );
  let threshold = random() * totalWeight;
  for (const student of students) {
    threshold -= followedStudentIds.has(student.id) ? 2 : 1;
    if (threshold < 0) return student;
  }
  return students[students.length - 1];
}

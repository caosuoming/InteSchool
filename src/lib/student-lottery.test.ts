import { describe, expect, it } from "vitest";
import {
  eligibleLotteryStudents,
  pickWeightedLotteryStudent,
  studentLotteryDurationMs,
} from "./student-lottery";

const students = [
  { id: "followed", name: "关注学生" },
  { id: "normal", name: "普通学生" },
  { id: "ignored", name: "不关注学生" },
];

describe("student lottery", () => {
  it("excludes ignored students before applying slide presets", () => {
    expect(eligibleLotteryStudents(students, new Set(["ignored"]))).toEqual(students.slice(0, 2));
    expect(eligibleLotteryStudents(students, new Set(["ignored"]), ["normal", "ignored"]))
      .toEqual([students[1]]);
  });

  it("gives followed students twice the winner weight of normal students", () => {
    const pool = students.slice(0, 2);
    const followed = new Set(["followed"]);
    expect(pickWeightedLotteryStudent(pool, followed, () => 0.65)).toBe(students[0]);
    expect(pickWeightedLotteryStudent(pool, followed, () => 0.75)).toBe(students[1]);
  });

  it("uses a random duration between three and five seconds", () => {
    expect(studentLotteryDurationMs(() => 0)).toBe(3000);
    expect(studentLotteryDurationMs(() => 0.5)).toBe(4000);
    expect(studentLotteryDurationMs(() => 0.999)).toBeGreaterThanOrEqual(3000);
    expect(studentLotteryDurationMs(() => 0.999)).toBeLessThan(5000);
  });
});

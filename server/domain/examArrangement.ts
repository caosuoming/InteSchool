import type {
  ExamArrangement,
  ExamArrangementContext,
  ExamArrangementInput,
  GradeImportContext,
} from "../../src/types/index.js";
import { generateExamAssignments } from "../../src/lib/exam-arrangement.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { gradeService } from "./grade.js";

function readArrangements(): ExamArrangement[] {
  const value = db.read("examArrangements");
  return Array.isArray(value) ? value as ExamArrangement[] : [];
}

function toArrangementContext(context: GradeImportContext): ExamArrangementContext {
  return {
    cohort: context.cohort,
    classes: context.classes,
    students: context.students,
  };
}

export const examArrangementService = {
  async listCohorts(schoolId: string) {
    return gradeService.listCohorts(schoolId);
  },

  async getContext(schoolId: string, cohortKey: string): Promise<ExamArrangementContext> {
    const context = await gradeService.getImportContext(schoolId, cohortKey);
    return toArrangementContext(context);
  },

  async listArrangements(schoolId: string, cohortKey?: string): Promise<ExamArrangement[]> {
    await delay(120);
    return readArrangements()
      .filter((item) => item.schoolId === schoolId && (!cohortKey || item.cohortKey === cohortKey))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },

  async saveArrangement(
    schoolId: string,
    teacherId: string,
    input: ExamArrangementInput,
  ): Promise<ExamArrangement> {
    await delay(180);
    maybeThrowError();
    const context = await this.getContext(schoolId, input.cohortKey);
    const assignments = generateExamAssignments(input, context);
    const existing = input.id
      ? readArrangements().find((item) => item.id === input.id)
      : undefined;
    if (input.id && !existing) throw new Error("考场安排方案不存在");
    if (existing && (existing.schoolId !== schoolId || existing.teacherId !== teacherId)) {
      throw new Error("无权修改其他教师的考场安排方案");
    }

    const now = new Date().toISOString();
    const arrangement: ExamArrangement = {
      id: existing?.id || genId("exam-arrangement"),
      schoolId,
      teacherId,
      cohortKey: context.cohort.key,
      cohortLabel: context.cohort.label,
      name: input.name.trim(),
      examDate: input.examDate || undefined,
      mode: input.mode,
      subjects: [...input.subjects],
      rooms: structuredClone(input.rooms),
      classRules: structuredClone(input.classRules),
      studentSubjects: structuredClone(input.studentSubjects),
      assignments,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    db.update("examArrangements", (items: ExamArrangement[]) => existing
      ? items.map((item) => item.id === existing.id ? arrangement : item)
      : [...items, arrangement]);
    return arrangement;
  },

  async deleteArrangement(arrangementId: string): Promise<void> {
    await delay(120);
    maybeThrowError();
    const exists = readArrangements().some((item) => item.id === arrangementId);
    if (!exists) throw new Error("考场安排方案不存在");
    db.update("examArrangements", (items: ExamArrangement[]) =>
      items.filter((item) => item.id !== arrangementId),
    );
  },
};

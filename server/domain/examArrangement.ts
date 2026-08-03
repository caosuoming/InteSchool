import type {
  ExamArrangement,
  ExamArrangementContext,
  ExamArrangementInput,
  GradeExam,
  GradeImportContext,
} from "../../src/types/index.js";
import { generateExamAssignments } from "../../src/lib/exam-arrangement.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { gradeService } from "./grade.js";

function readArrangements(): ExamArrangement[] {
  const value = db.read("examArrangements");
  if (!Array.isArray(value)) return [];
  return (value as ExamArrangement[]).map((item) => {
    const rooms = item.rooms.map((room) => ({
      ...room,
      name: room.number || room.name,
      number: room.number || room.name,
      location: room.location || room.name,
    }));
    const roomMap = new Map(rooms.map((room) => [room.id, room]));
    return {
      ...item,
      subjectSetupMode: item.subjectSetupMode || "all",
      selectionSubjects: structuredClone(item.selectionSubjects || {}),
      separateSubjects: structuredClone(
        item.separateSubjects ?? (item.mode === "subject" ? item.subjects : []),
      ),
      seatOrder: item.seatOrder || "random",
      rooms,
      studentSubjects: item.studentSubjects.map((selection) => ({
        ...selection,
        absent: Boolean(selection.absent),
      })),
      assignments: item.assignments.map((assignment) => {
        const room = roomMap.get(assignment.roomId);
        return {
          ...assignment,
          roomName: assignment.roomNumber || assignment.roomName,
          roomNumber: assignment.roomNumber || assignment.roomName,
          roomLocation: assignment.roomLocation || room?.location || assignment.roomName,
        };
      }),
    };
  });
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
    const exams = db.read("gradeExams");
    const latestExam = (Array.isArray(exams) ? exams as GradeExam[] : [])
      .filter((exam) => exam.schoolId === schoolId && exam.cohortKey === cohortKey)
      .sort((left, right) => {
        const leftTime = left.examDate || left.updatedAt || left.createdAt;
        const rightTime = right.examDate || right.updatedAt || right.createdAt;
        return rightTime.localeCompare(leftTime);
      })[0];
    return {
      ...toArrangementContext(context),
      previousGradeRanks: latestExam
        ? Object.fromEntries(latestExam.records.map((record) => [record.studentId, record.gradeRank]))
        : undefined,
    };
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
    const separateSubjects = input.separateSubjects ?? (input.mode === "subject" ? input.subjects : []);
    const preparedInput: ExamArrangementInput = {
      ...input,
      subjectSetupMode: input.subjectSetupMode || "all",
      selectionSubjects: structuredClone(input.selectionSubjects || {}),
      separateSubjects: structuredClone(separateSubjects),
      seatOrder: input.seatOrder || "random",
      rooms: input.rooms.map((room) => ({
        ...room,
        name: room.number || room.name,
        number: room.number || room.name,
        location: room.location || room.name,
      })),
      studentSubjects: input.studentSubjects.map((selection) => ({
        ...selection,
        absent: Boolean(selection.absent),
      })),
    };
    const assignments = generateExamAssignments(preparedInput, context);
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
      name: preparedInput.name.trim(),
      examDate: preparedInput.examDate || undefined,
      mode: preparedInput.mode,
      subjectSetupMode: preparedInput.subjectSetupMode,
      subjects: [...preparedInput.subjects],
      selectionSubjects: structuredClone(preparedInput.selectionSubjects),
      separateSubjects: structuredClone(preparedInput.separateSubjects),
      seatOrder: preparedInput.seatOrder,
      rooms: structuredClone(preparedInput.rooms),
      classRules: structuredClone(preparedInput.classRules),
      studentSubjects: structuredClone(preparedInput.studentSubjects),
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

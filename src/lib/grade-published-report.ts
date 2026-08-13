import type { GradeExam, GradeImportContext } from "../types/index.js";
import {
  buildGradeClassAverageReport,
  type GradeClassAverageReport,
} from "./grade-class-average.js";
import {
  buildGradeElectiveScoreSegmentReport,
  type GradeElectiveScoreSegmentReport,
} from "./grade-elective-score-segment.js";
import {
  buildGradeSubjectScoreSegmentReport,
  type GradeSubjectScoreSegmentReport,
} from "./grade-subject-score-segment.js";
import {
  buildGradeTotalScoreSegmentReport,
  type GradeTotalScoreSegmentReport,
} from "./grade-total-score-segment.js";

export interface GradePublishedReportBundle {
  exam: {
    id: string;
    cohortLabel: string;
    name: string;
    examDate?: string;
    publishedAt: string;
  };
  classAverage?: GradeClassAverageReport;
  totalScoreSegment?: GradeTotalScoreSegmentReport;
  subjectScoreSegment?: GradeSubjectScoreSegmentReport;
  electiveScoreSegment?: GradeElectiveScoreSegmentReport;
}

export function buildGradePublishedReportBundle(
  exam: GradeExam,
  context: GradeImportContext,
  publishedAt: string,
): GradePublishedReportBundle {
  const classAverageTemplate = exam.settings.templates.find((item) => item.kind === "classAverage");
  const totalScoreSegmentTemplate = exam.settings.templates.find((item) => item.kind === "totalScoreSegment");
  const bundle: GradePublishedReportBundle = {
    exam: {
      id: exam.id,
      cohortLabel: exam.cohortLabel,
      name: exam.name,
      examDate: exam.examDate,
      publishedAt,
    },
  };

  if (classAverageTemplate) {
    bundle.classAverage = buildGradeClassAverageReport(
      exam,
      classAverageTemplate,
      context,
      exam.settings,
    );
  }
  if (totalScoreSegmentTemplate) {
    bundle.totalScoreSegment = buildGradeTotalScoreSegmentReport(
      exam,
      totalScoreSegmentTemplate,
      context,
      classAverageTemplate,
    );
    bundle.subjectScoreSegment = buildGradeSubjectScoreSegmentReport(
      exam,
      totalScoreSegmentTemplate,
      context,
      exam.settings,
      classAverageTemplate,
    );
    bundle.electiveScoreSegment = buildGradeElectiveScoreSegmentReport(
      exam,
      totalScoreSegmentTemplate,
      context,
      exam.settings,
      classAverageTemplate,
    );
  }

  return bundle;
}

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
import {
  buildGradeTotalScoreRankingReport,
  type GradeTotalScoreRankingReport,
  type GradeTotalScoreRankingTable,
} from "./grade-total-score-ranking.js";

export interface GradePublishedTotalScoreRankingTable extends Omit<GradeTotalScoreRankingTable, "rows"> {
  rows: Array<Omit<GradeTotalScoreRankingTable["rows"][number], "studentId" | "classId">>;
}

export interface GradePublishedTotalScoreRankingReport extends Omit<GradeTotalScoreRankingReport, "tables"> {
  tables: GradePublishedTotalScoreRankingTable[];
}

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
  totalScoreRanking?: GradePublishedTotalScoreRankingReport;
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
    const ranking = buildGradeTotalScoreRankingReport(
      exam,
      totalScoreSegmentTemplate,
      context,
      classAverageTemplate,
    );
    bundle.totalScoreRanking = {
      ...ranking,
      tables: ranking.tables.map((table) => ({
        ...table,
        rows: table.rows.map((row) => ({
          rank: row.rank,
          studentNo: row.studentNo,
          studentName: row.studentName,
          classLabel: row.classLabel,
          subjectScores: row.subjectScores,
          score: row.score,
        })),
      })),
    };
  }

  return bundle;
}

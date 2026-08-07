import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import {
  BookOpen, CheckSquare, Edit3, Eye, FileText, GraduationCap,
  Printer, Type, UserCheck, Users,
} from "lucide-react";
import { lectureService } from "@/services/lecture";
import { questionService } from "@/services/question";
import { classService } from "@/services/class";
import { analyticsService } from "@/services/analytics";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { MathHtml } from "@/components/ui/MathHtml";
import type { AnswerRecord, AnyClass, Lecture, LectureSection, Question, Student } from "@/types";
import { cn, getOptionsGridCols } from "@/lib/utils";

type PaperSize = "A4" | "8K";

interface LecturePreviewRow {
  section: LectureSection;
  depth: number;
  questionNumber?: number;
}

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];
const difficultyVariant = ["", "green", "green", "amber", "red", "red"];
const typeLabel: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

function flattenSections(sections: LectureSection[]): LectureSection[] {
  return sections.flatMap((section) => [section, ...flattenSections(section.children || [])]);
}

function buildPreviewRows(
  sections: LectureSection[],
  documentTitleSectionId: string | null,
): LecturePreviewRow[] {
  const rows: LecturePreviewRow[] = [];
  let questionNumber = 0;

  const visit = (section: LectureSection, depth: number) => {
    if (section.id === documentTitleSectionId) return;
    if (section.type === "question") questionNumber += 1;
    rows.push({
      section,
      depth,
      questionNumber: section.type === "question" ? questionNumber : undefined,
    });
    section.children.forEach((child) => visit(child, depth + 1));
  };

  sections.forEach((section) => visit(section, 0));
  return rows;
}

export default function LecturePreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [allSchoolStudents, setAllSchoolStudents] = useState<Student[]>([]);
  const [questions, setQuestions] = useState<Record<string, Question | null>>({});
  const [answerRecords, setAnswerRecords] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceStudentIds, setAudienceStudentIds] = useState<string[]>([]);
  const [savingAudience, setSavingAudience] = useState(false);
  const [markingAllDone, setMarkingAllDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      const loadedLecture = await lectureService.getLecture(id);
      if (!loadedLecture) {
        navigate("/my-resources");
        return;
      }

      const questionIds = Array.from(new Set(
        flattenSections(loadedLecture.sections)
          .filter((section) => section.type === "question" && section.questionId)
          .map((section) => section.questionId as string),
      ));
      const [loadedClasses, classStudentGroups, explicitStudents, loadedQuestions, schoolStudents, records] = await Promise.all([
        loadedLecture.classIds.length > 0
          ? classService.getClassesByIds(loadedLecture.classIds)
          : Promise.resolve([]),
        Promise.all(
          loadedLecture.classIds.map((classId) => classService.listStudentsByClass(classId)),
        ),
        Promise.all(
          loadedLecture.studentIds.map((studentId) => classService.getStudent(studentId)),
        ),
        Promise.all(
          questionIds.map(async (questionId) => [
            questionId,
            await questionService.getQuestion(questionId).catch(() => null),
          ] as const),
        ),
        classService.listStudentsBySchool(loadedLecture.schoolId),
        analyticsService.listAnswerRecordsByLecture(loadedLecture.id),
      ]);
      const studentMap = new Map<string, Student>();
      [
        ...classStudentGroups.flat(),
        ...explicitStudents.filter((student): student is Student => Boolean(student)),
      ].forEach((student) => studentMap.set(student.id, student));

      if (cancelled) return;
      setLecture(loadedLecture);
      setClasses(loadedClasses);
      setStudents(Array.from(studentMap.values()));
      setAllSchoolStudents(schoolStudents);
      setAudienceStudentIds(loadedLecture.studentIds);
      setQuestions(Object.fromEntries(loadedQuestions));
      setAnswerRecords(records);
      setLoading(false);
    };
    load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, navigate]);

  const sections = useMemo(() => lecture?.sections || [], [lecture]);
  const allSections = useMemo(() => flattenSections(sections), [sections]);
  const columns = useMemo(
    () => sections.filter((section) => section.type === "chapter"),
    [sections],
  );
  const documentTitle = useMemo(
    () => lecture?.contentBlocks
      ?.find((block) => block.type === "documentTitle")
      ?.content.trim() || null,
    [lecture],
  );
  const documentTitleSectionId = useMemo(
    () => documentTitle
      ? sections.find(
        (section) => section.type === "chapter" && section.title.trim() === documentTitle,
      )?.id || null
      : null,
    [documentTitle, sections],
  );
  const previewRows = useMemo(
    () => buildPreviewRows(sections, documentTitleSectionId),
    [documentTitleSectionId, sections],
  );
  const questionCount = useMemo(
    () => allSections.filter((section) => section.type === "question").length,
    [allSections],
  );
  const usageTarget = useMemo(() => {
    const classNames = classes.map((item) => item.name).join("、");
    if (classNames) return `${classNames} · ${students.length} 名学生`;
    if (students.length > 0) return `${students.length} 名学生`;
    return "未指定";
  }, [classes, students.length]);

  const questionIds = useMemo(
    () => Array.from(new Set(
      allSections
        .filter((section) => section.type === "question" && section.questionId)
        .map((section) => section.questionId as string),
    )),
    [allSections],
  );

  const saveAudience = async () => {
    if (!lecture) return;
    setSavingAudience(true);
    try {
      const updated = await lectureService.updateLecture(lecture.id, { studentIds: audienceStudentIds });
      setLecture(updated);
      const explicitStudents = allSchoolStudents.filter((student) => audienceStudentIds.includes(student.id));
      const classStudentGroups = await Promise.all(
        updated.classIds.map((classId) => classService.listStudentsByClass(classId)),
      );
      const studentMap = new Map<string, Student>();
      [...classStudentGroups.flat(), ...explicitStudents].forEach((student) => studentMap.set(student.id, student));
      setStudents(Array.from(studentMap.values()));
      setAudienceOpen(false);
      toast.success("发布对象已更新");
    } catch (error) {
      toast.error("更新发布对象失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingAudience(false);
    }
  };

  const toggleQuestionUsage = async (studentId: string, questionId: string, used: boolean) => {
    if (!lecture) return;
    try {
      await analyticsService.saveAnswerRecord({
        studentId,
        questionId,
        lectureId: lecture.id,
        score: used ? null : "done",
        source: "manual",
      });
      setAnswerRecords(await analyticsService.listAnswerRecordsByLecture(lecture.id));
    } catch (error) {
      toast.error("更新使用情况失败", error instanceof Error ? error.message : undefined);
    }
  };

  const markAllQuestionsUsed = async () => {
    if (!lecture || students.length === 0 || questionIds.length === 0) return;
    setMarkingAllDone(true);
    try {
      const existing = new Set(answerRecords.map((record) => `${record.studentId}:${record.questionId}`));
      const pending = students.flatMap((student) => questionIds
        .filter((questionId) => !existing.has(`${student.id}:${questionId}`))
        .map((questionId) => ({
          studentId: student.id,
          questionId,
          lectureId: lecture.id,
          score: "done" as const,
          source: "manual" as const,
        })));
      if (pending.length > 0) await analyticsService.batchSaveAnswerRecords(pending);
      setAnswerRecords(await analyticsService.listAnswerRecordsByLecture(lecture.id));
      toast.success(pending.length > 0 ? `已补充 ${pending.length} 条使用记录` : "所有学生均已设置为使用全部题目");
    } catch (error) {
      toast.error("批量设置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setMarkingAllDone(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="py-20 text-center text-sm text-ink-400">
        讲义加载失败
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader
        title={`预览：${lecture.title}`}
        description="检查讲义内容、版面与题目属性"
        icon={<Eye className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAudienceOpen(true)}>
              <Users className="w-4 h-4" />
              <span className="max-w-48 truncate">{usageTarget === "未指定" ? "选择发布对象" : usageTarget}</span>
            </Button>
            <Button variant="outline" onClick={() => navigate(`/lectures/${id}/edit`)}>
              <Edit3 className="w-4 h-4" />
              编辑讲义
            </Button>
            <Button variant="gold" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              打印
            </Button>
          </div>
        }
      />

      <Card className="no-print p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-gold-600" />
            <h3 className="font-serif font-semibold text-ink-900">讲义属性</h3>
          </div>
          <Badge variant={lecture.status === "published" ? "green" : "default"}>
            {lecture.status === "published" ? "已发布" : "草稿"}
          </Badge>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <Property label="标题" value={lecture.title} className="sm:col-span-2 xl:col-span-2" />
          <Property label="描述" value={lecture.description || "未填写"} className="sm:col-span-2 xl:col-span-2" />
          <Property label="年级" value={lecture.grade || "未设置"} icon={<GraduationCap className="w-3.5 h-3.5" />} />
          <Property label="学年" value={lecture.schoolYear || "未设置"} />
          <Property label="学期" value={lecture.semester || "上学期"} />
          <Property label="内容" value={`${columns.length} 栏目 · ${questionCount} 题`} />
          <Property
            label="使用对象"
            value={usageTarget}
            icon={<UserCheck className="w-3.5 h-3.5" />}
            className="sm:col-span-2 xl:col-span-4"
          />
          <Property
            label="学生人数"
            value={`${students.length} 人`}
            icon={<Users className="w-3.5 h-3.5" />}
          />
        </div>
        {(classes.length > 0 || students.length > 0) && (
          <div className="mt-3 grid gap-3 border-t border-ink-100 pt-3 lg:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-ink-500">适用班级</div>
              <div className="flex flex-wrap gap-1.5">
                {classes.length > 0 ? classes.map((item) => (
                  <span
                    key={item.id}
                    className="rounded border border-teal-100 bg-teal-50 px-2 py-1 text-xs text-teal-700"
                  >
                    {item.name}
                  </span>
                )) : (
                  <span className="text-xs text-ink-400">未指定班级</span>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-ink-500">学生</div>
              <div className="flex flex-wrap gap-1.5">
                {students.length > 0 ? students.map((student) => (
                  <span
                    key={student.id}
                    className="rounded border border-ink-100 bg-ink-50 px-2 py-1 text-xs text-ink-600"
                  >
                    {student.name}
                  </span>
                )) : (
                  <span className="text-xs text-ink-400">未指定学生</span>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="no-print mb-4 flex items-center justify-end gap-2">
        <select
          aria-label="纸张大小"
          value={paperSize}
          onChange={(event) => setPaperSize(event.target.value as PaperSize)}
          className="text-xs border border-ink-200 rounded-md px-2 py-1.5 bg-paper text-ink-700"
        >
          <option value="A4">A4 单栏</option>
          <option value="8K">8K 宽版</option>
        </select>
      </div>

      <div className="overflow-x-auto pb-4">
        <div
          className={cn(
            "lecture-preview-grid",
            paperSize === "8K" && "lecture-preview-8k",
          )}
          data-testid="lecture-paper"
        >
          <LecturePreviewPair
            leftClassName="lecture-preview-title"
            left={(
              <div className="text-center border-b-2 border-ink-200 pb-4">
                <MathHtml className="font-serif text-2xl font-bold text-ink-900">
                  {documentTitle || lecture.title}
                </MathHtml>
                {!documentTitle && lecture.description && (
                  <MathHtml className="mt-2 text-sm text-ink-500">{lecture.description}</MathHtml>
                )}
              </div>
            )}
            right={(
              <div data-testid="lecture-preview-details">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-serif text-sm font-semibold text-ink-900">题目属性与使用情况</div>
                    <div className="mt-1 text-xs leading-5 text-ink-400">可逐题调整发布对象是否使用该题</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={markAllQuestionsUsed}
                    loading={markingAllDone}
                    disabled={students.length === 0 || questionIds.length === 0}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    全部设为使用
                  </Button>
                </div>
              </div>
            )}
          />

          {previewRows.length === 0 ? (
            <LecturePreviewPair
              left={(
                <div className="text-center py-16 text-ink-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-ink-200" />
                  <div className="text-sm">当前讲义暂无内容</div>
                </div>
              )}
            />
          ) : (
            previewRows.map((row) => {
              const question = row.section.questionId
                ? questions[row.section.questionId]
                : null;
              return (
                <LecturePreviewPair
                  key={row.section.id}
                  left={(
                    <PreviewSectionContent
                      row={row}
                      question={question}
                    />
                  )}
                  right={row.questionNumber ? (
                    <LectureQuestionDetails
                      question={question}
                      questionNumber={row.questionNumber}
                      students={students}
                      answerRecords={answerRecords}
                      onToggleUsage={toggleQuestionUsage}
                    />
                  ) : undefined}
                />
              );
            })
          )}
        </div>
      </div>

      <Modal
        open={audienceOpen}
        onClose={() => setAudienceOpen(false)}
        size="lg"
        title="选择发布对象"
        description="选择讲义直接指定的使用学生；已指定班级中的学生仍会保留。"
        footer={(
          <div className="flex w-full items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setAudienceStudentIds([])}>清空直接指定</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAudienceOpen(false)}>取消</Button>
              <Button variant="gold" size="sm" onClick={saveAudience} loading={savingAudience}>
                确定（{audienceStudentIds.length} 人）
              </Button>
            </div>
          </div>
        )}
      >
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-ink-100">
          {allSchoolStudents.map((student) => {
            const checked = audienceStudentIds.includes(student.id);
            return (
              <label key={student.id} className="flex cursor-pointer items-center gap-3 border-b border-ink-50 px-3 py-2.5 last:border-b-0 hover:bg-ink-50/50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setAudienceStudentIds((previous) => checked
                    ? previous.filter((studentId) => studentId !== student.id)
                    : [...previous, student.id])}
                  className="rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                />
                <span className="text-sm font-medium text-ink-800">{student.name}</span>
                <span className="text-xs text-ink-400">{student.studentNo}</span>
              </label>
            );
          })}
          {allSchoolStudents.length === 0 && <div className="p-6 text-center text-sm text-ink-400">暂无可选学生</div>}
        </div>
      </Modal>
    </div>
  );
}

function Property({ label, value, icon, className }: { label: string; value: string; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-2 min-w-0", className)}>
      <div className="text-[10px] text-ink-400 mb-0.5 flex items-center gap-1">{icon}{label}</div>
      <div className="text-xs font-medium text-ink-800 truncate" title={value}>{value}</div>
    </div>
  );
}

function LecturePreviewPair({
  left,
  right,
  leftClassName,
}: {
  left: ReactNode;
  right?: ReactNode;
  leftClassName?: string;
}) {
  return (
    <>
      <div className={cn("lecture-preview-left", leftClassName)}>{left}</div>
      <aside className="lecture-preview-right no-print">{right}</aside>
    </>
  );
}

function PreviewSectionContent({
  row,
  question,
}: {
  row: LecturePreviewRow;
  question: Question | null | undefined;
}) {
  const { section, depth, questionNumber } = row;
  const nestedClassName = depth > 0 ? "ml-3 border-l-2 border-ink-100 pl-3" : undefined;

  if (section.type === "chapter") {
    return (
      <section className={cn("pt-3 pb-2", nestedClassName)}>
        <MathHtml className="font-serif text-xl font-bold text-ink-900">
          {section.customLabel ? `${section.customLabel} ${section.title}` : section.title}
        </MathHtml>
        {section.content && (
          <MathHtml className="mt-3 text-sm text-ink-600 leading-relaxed whitespace-pre-wrap pl-2">
            {section.content}
          </MathHtml>
        )}
      </section>
    );
  }

  if (section.type === "question") {
    return (
      <QuestionPreviewContent
        section={section}
        question={question}
        questionNumber={questionNumber || 0}
        className={nestedClassName}
      />
    );
  }

  if (section.type === "knowledge") {
    return (
      <section className={cn("py-2", nestedClassName)}>
        <MathHtml className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">
          {section.content}
        </MathHtml>
      </section>
    );
  }

  if (!section.content && (section.title === "空白行" || section.title === "[空白行]")) {
    return <div className="h-8" />;
  }

  return (
    <section className={cn("py-2", nestedClassName)}>
      <div className="flex items-center gap-2 mb-1.5">
        <Type className="w-4 h-4 text-ink-400" />
        <MathHtml className="font-serif font-medium text-ink-900">
          {section.customLabel ? `${section.customLabel} ${section.title}` : section.title}
        </MathHtml>
      </div>
      <MathHtml className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed pl-6">
        {section.content}
      </MathHtml>
    </section>
  );
}

function QuestionPreviewContent({
  section,
  question,
  questionNumber,
  className,
}: {
  section: LectureSection;
  question: Question | null | undefined;
  questionNumber: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((value) => !value);

  if (!question) {
    return (
      <div className={cn("py-3 text-sm text-ink-400", className)}>
        题目加载失败
      </div>
    );
  }

  const label = section.customLabel || `${questionNumber}.`;
  return (
    <section className={cn("py-3", className)}>
      <div className="space-y-2">
        <div
          role="button"
          tabIndex={0}
          onClick={toggleExpanded}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleExpanded();
            }
          }}
          aria-expanded={expanded}
          aria-label={`${expanded ? "隐藏" : "显示"}答案与解析：${question.stem}`}
          className="w-full text-left text-sm text-ink-900 leading-relaxed flex items-start gap-1.5 cursor-pointer"
        >
          <span className="font-mono text-ink-400 flex-shrink-0">{label}</span>
          <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
        </div>
        {question.options && question.options.length > 0 && (
          <div className={cn("gap-2 grid", getOptionsGridCols(question.options.length))}>
            {question.options.map((option, index) => (
              <div
                key={index}
                className={cn(
                  "p-2 rounded-md border text-sm flex items-start gap-1.5 min-w-0",
                  expanded && question.answer.includes(String.fromCharCode(65 + index))
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-ink-100",
                )}
              >
                <span className="font-mono font-semibold text-ink-700 flex-shrink-0">
                  {String.fromCharCode(65 + index)}.
                </span>
                <MathHtml className="min-w-0 text-ink-900 break-all">{option}</MathHtml>
              </div>
            ))}
          </div>
        )}
        {expanded && (
          <div className="space-y-2 animate-fade-in">
            <div className="p-2.5 rounded-md bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900 flex items-start gap-1">
              <span className="font-bold flex-shrink-0">答案：</span>
              <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.answer}</MathHtml>
            </div>
            <div className="p-2.5 rounded-md bg-gold-50/30 border border-gold-200 text-sm text-ink-900 leading-relaxed flex items-start gap-1">
              <span className="font-bold text-gold-700 flex-shrink-0">解析：</span>
              <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.analysis}</MathHtml>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LectureQuestionDetails({
  question,
  questionNumber,
  students,
  answerRecords,
  onToggleUsage,
}: {
  question: Question | null | undefined;
  questionNumber: number;
  students: Student[];
  answerRecords: AnswerRecord[];
  onToggleUsage: (studentId: string, questionId: string, used: boolean) => Promise<void>;
}) {
  if (!question) {
    return (
      <div className="rounded-lg border border-ink-100 bg-paper p-3 text-xs text-ink-400 shadow-sm">
        第 {questionNumber} 题属性加载失败
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-ink-100 bg-paper p-3 shadow-sm"
      data-testid={`lecture-question-details-${questionNumber}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs font-bold text-ink-500">第 {questionNumber} 题</span>
        <Badge variant="ink">{typeLabel[question.type] || question.type}</Badge>
        <Badge variant={difficultyVariant[question.difficulty] as "green" | "amber" | "red"}>
          {difficultyLabel[question.difficulty]}
        </Badge>
      </div>
      {students.length > 0 && (
        <div className="mb-3 border-b border-ink-100 pb-3">
          <div className="mb-1.5 text-[11px] font-medium text-ink-500">学生使用情况</div>
          <div className="flex flex-wrap gap-1.5">
            {students.map((student) => {
              const used = answerRecords.some(
                (record) => record.studentId === student.id && record.questionId === question.id,
              );
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => onToggleUsage(student.id, question.id, used)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                    used
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-ink-200 bg-white text-ink-500 hover:border-gold-300",
                  )}
                >
                  {student.name} · {used ? "已使用" : "未使用"}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] leading-5">
        <QuestionProperty label="年级" value={question.grade || "未设置"} />
        <QuestionProperty label="学年学期" value={[
          question.schoolYear,
          question.semester,
        ].filter(Boolean).join(" · ") || "未设置"} />
        <QuestionProperty label="使用次数" value={`${question.usageCount} 次`} />
        <QuestionProperty label="推荐度" value={`${question.recommendation} / 5`} />
        <QuestionProperty label="章节关联" value={question.chapterIds.length > 0 ? `${question.chapterIds.length} 项` : "未关联"} />
        <QuestionProperty label="知识点" value={question.knowledgePointIds.length > 0 ? `${question.knowledgePointIds.length} 项` : "未关联"} />
      </div>
      {question.category && (
        <div className="mt-2 text-[11px] leading-5 text-ink-500">
          <span className="text-ink-400">题类：</span>{question.category}
        </div>
      )}
      {question.sourceType && (
        <div className="text-[11px] leading-5 text-ink-500">
          <span className="text-ink-400">来源：</span>{question.sourceType}
        </div>
      )}
      {question.remark && (
        <div className="mt-2 rounded-md bg-ink-50 px-2 py-1.5 text-[11px] leading-5 text-ink-500">
          {question.remark}
        </div>
      )}
    </div>
  );
}

function QuestionProperty({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-ink-400">{label}</div>
      <div className="truncate font-medium text-ink-600" title={value}>{value}</div>
    </div>
  );
}

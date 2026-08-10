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
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { knowledgeService } from "@/services/knowledge";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { MathHtml } from "@/components/ui/MathHtml";
import { ClassAudiencePicker } from "@/components/editor/ClassAudiencePicker";
import { StudentAnswerStatusControl } from "@/components/editor/StudentAnswerStatusControl";
import {
  PreviewSidebarControls,
  type PreviewSidebarVisibility,
} from "@/components/editor/PreviewSidebarControls";
import { AddToBasketDropdown } from "@/components/basket/AddToBasketDropdown";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type { AnswerRecord, AnswerScore, AnyClass, Lecture, LectureSection, LessonCourseware, Question, Student, TreeNode } from "@/types";
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
  const { teacher } = useAuthStore();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [availableClasses, setAvailableClasses] = useState<AnyClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [questions, setQuestions] = useState<Record<string, Question | null>>({});
  const [answerRecords, setAnswerRecords] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceClassIds, setAudienceClassIds] = useState<string[]>([]);
  const [savingAudience, setSavingAudience] = useState(false);
  const [markingAllDone, setMarkingAllDone] = useState(false);
  const [sendingToCourseware, setSendingToCourseware] = useState(false);
  const [linkedCourseware, setLinkedCourseware] = useState<LessonCourseware | null>(null);
  const [linkedCoursewareLoading, setLinkedCoursewareLoading] = useState(false);
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [metadataQuestion, setMetadataQuestion] = useState<Question | null>(null);
  const [metadataChapterIds, setMetadataChapterIds] = useState<string[]>([]);
  const [metadataKnowledgePointIds, setMetadataKnowledgePointIds] = useState<string[]>([]);
  const [savingQuestionMetadata, setSavingQuestionMetadata] = useState(false);
  const [previewSidebarVisibility, setPreviewSidebarVisibility] = useState<PreviewSidebarVisibility>(
    { properties: true, answerStatus: true, basket: true },
  );

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
      const [loadedClasses, availableClassList, classStudentGroups, loadedQuestions, records] = await Promise.all([
        loadedLecture.classIds.length > 0
          ? classService.getClassesByIds(loadedLecture.classIds)
          : Promise.resolve([]),
        classService.listAllClasses(loadedLecture.schoolId, loadedLecture.teacherId),
        Promise.all(
          loadedLecture.classIds.map((classId) => classService.listStudentsByClass(classId)),
        ),
        Promise.all(
          questionIds.map(async (questionId) => [
            questionId,
            await questionService.getQuestion(questionId).catch(() => null),
          ] as const),
        ),
        analyticsService.listAnswerRecordsByLecture(loadedLecture.id),
      ]);
      const studentMap = new Map<string, Student>();
      classStudentGroups.flat().forEach((student) => studentMap.set(student.id, student));

      if (cancelled) return;
      setLecture(loadedLecture);
      setClasses(loadedClasses);
      setAvailableClasses(availableClassList);
      setStudents(Array.from(studentMap.values()));
      setAudienceClassIds(loadedLecture.classIds);
      setQuestions(Object.fromEntries(loadedQuestions));
      setAnswerRecords(records);
      setLoading(false);
    };
    load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, navigate]);

  useEffect(() => {
    if (!lecture?.schoolId) {
      setChapterTree(null);
      setKnowledgeTree(null);
      return;
    }

    let cancelled = false;
    Promise.all([
      knowledgeService.getChapterTree(lecture.schoolId),
      knowledgeService.getKnowledgeTree(lecture.schoolId),
    ]).then(([nextChapterTree, nextKnowledgeTree]) => {
      if (cancelled) return;
      setChapterTree(nextChapterTree);
      setKnowledgeTree(nextKnowledgeTree);
    }).catch(() => {
      if (cancelled) return;
      setChapterTree(null);
      setKnowledgeTree(null);
    });

    return () => {
      cancelled = true;
    };
  }, [lecture?.schoolId]);

  useEffect(() => {
    if (!lecture || !teacher || lecture.teacherId !== teacher.id || !teacher.schoolId) {
      setLinkedCourseware(null);
      setLinkedCoursewareLoading(false);
      return;
    }
    let cancelled = false;
    setLinkedCoursewareLoading(true);
    lessonCoursewareService.getCoursewareBySource(
      teacher.id,
      teacher.schoolId,
      "lecture",
      lecture.id,
    ).then((courseware) => {
      if (!cancelled) setLinkedCourseware(courseware);
    }).catch(() => {
      if (!cancelled) setLinkedCourseware(null);
    }).finally(() => {
      if (!cancelled) setLinkedCoursewareLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lecture, teacher]);

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
    return classNames ? `${classNames} · ${students.length} 名学生` : "未指定";
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
      const updated = await lectureService.updateLecture(lecture.id, {
        classIds: audienceClassIds,
        studentIds: [],
      });
      const [updatedClasses, classStudentGroups] = await Promise.all([
        audienceClassIds.length > 0 ? classService.getClassesByIds(audienceClassIds) : Promise.resolve([]),
        Promise.all(audienceClassIds.map((classId) => classService.listStudentsByClass(classId))),
      ]);
      const studentMap = new Map<string, Student>();
      classStudentGroups.flat().forEach((student) => studentMap.set(student.id, student));
      setLecture(updated);
      setClasses(updatedClasses);
      setStudents(Array.from(studentMap.values()));
      setAudienceOpen(false);
      toast.success("使用对象已更新");
    } catch (error) {
      toast.error("更新使用对象失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingAudience(false);
    }
  };

  const handleSendToMyCourseware = async () => {
    if (!lecture || !teacher?.schoolId || lecture.teacherId !== teacher.id) return;
    if (linkedCourseware) {
      navigate(`/my-lessons/${linkedCourseware.id}/edit?preview=1`);
      return;
    }
    setSendingToCourseware(true);
    try {
      const courseware = await lessonCoursewareService.createFromLecture(
        teacher.id,
        teacher.schoolId,
        lecture.id,
      );
      setLinkedCourseware(courseware);
      toast.success("已发送到我的课件", "正在进入课件编辑...");
      navigate(`/my-lessons/${courseware.id}/edit`);
    } catch (error) {
      toast.error("发送失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSendingToCourseware(false);
    }
  };

  const updateStudentAnswer = async (
    studentId: string,
    questionId: string,
    score: AnswerScore | null,
  ) => {
    if (!lecture) return;
    try {
      await analyticsService.saveAnswerRecord({
        studentId,
        questionId,
        lectureId: lecture.id,
        score,
        source: "manual",
      });
      setAnswerRecords(await analyticsService.listAnswerRecordsByLecture(lecture.id));
    } catch (error) {
      toast.error("更新答题情况失败", error instanceof Error ? error.message : undefined);
    }
  };

  const openQuestionMetadataEditor = (question: Question) => {
    setMetadataQuestion(question);
    setMetadataChapterIds([...question.chapterIds]);
    setMetadataKnowledgePointIds([...question.knowledgePointIds]);
  };

  const closeQuestionMetadataEditor = () => {
    if (!savingQuestionMetadata) setMetadataQuestion(null);
  };

  const saveQuestionMetadata = async () => {
    if (!metadataQuestion) return;
    setSavingQuestionMetadata(true);
    try {
      const updated = await questionService.updateQuestion(metadataQuestion.id, {
        chapterIds: metadataChapterIds,
        knowledgePointIds: metadataKnowledgePointIds,
      });
      setQuestions((current) => ({ ...current, [updated.id]: updated }));
      setMetadataQuestion(null);
      toast.success("题目目录已更新");
    } catch (error) {
      toast.error("更新题目目录失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingQuestionMetadata(false);
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
              <span className="max-w-48 truncate">{usageTarget === "未指定" ? "添加使用对象" : usageTarget}</span>
            </Button>
            {lecture.teacherId === teacher?.id && (
              <Button
                variant="outline"
                onClick={handleSendToMyCourseware}
                loading={sendingToCourseware}
                disabled={linkedCoursewareLoading}
              >
                <BookOpen className="w-4 h-4" />
                {linkedCourseware ? "课件" : "发送到我的课件"}
              </Button>
            )}
            {!lecture.isExtractCopy && (
              <Button variant="outline" onClick={() => navigate(`/lectures/${id}/edit`)}>
                <Edit3 className="w-4 h-4" />
                编辑讲义
              </Button>
            )}
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
        {classes.length > 0 && (
          <div className="mt-3 border-t border-ink-100 pt-3">
            <div className="mb-1.5 text-[11px] font-medium text-ink-500">适用班级</div>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((item) => (
                <span
                  key={item.id}
                  className="rounded border border-teal-100 bg-teal-50 px-2 py-1 text-xs text-teal-700"
                >
                  {item.name}
                </span>
              ))}
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
                    <div className="mt-1 text-xs leading-5 text-ink-400">选择具体学生后可重新设置该题的答题情况</div>
                  </div>
                  {previewSidebarVisibility.answerStatus && (
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
                  )}
                </div>
                <PreviewSidebarControls
                  value={previewSidebarVisibility}
                  onChange={setPreviewSidebarVisibility}
                />
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
                      onUpdateStudentAnswer={updateStudentAnswer}
                      onEditMetadata={lecture.teacherId === teacher?.id && !lecture.isExtractCopy
                        ? openQuestionMetadataEditor
                        : undefined}
                      visibility={previewSidebarVisibility}
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
        title="添加使用对象"
        description="使用对象只设置到班级；具体学生的答题情况可在右侧逐题调整。"
        footer={(
          <div className="flex w-full items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setAudienceClassIds([])}>清空选择</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAudienceOpen(false)}>取消</Button>
              <Button variant="gold" size="sm" onClick={saveAudience} loading={savingAudience}>
                确定（{audienceClassIds.length} 个班级）
              </Button>
            </div>
          </div>
        )}
      >
        <ClassAudiencePicker
          classes={availableClasses}
          selectedClassIds={audienceClassIds}
          onChange={setAudienceClassIds}
        />
      </Modal>

      <Modal
        open={Boolean(metadataQuestion)}
        onClose={closeQuestionMetadataEditor}
        size="xl"
        title="编辑题目目录"
        description="调整当前题目关联的章节与知识点。"
        footer={(
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeQuestionMetadataEditor} disabled={savingQuestionMetadata}>
              取消
            </Button>
            <Button variant="gold" size="sm" onClick={saveQuestionMetadata} loading={savingQuestionMetadata}>
              保存目录
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-ink-150">
            {chapterTree ? (
              <SearchableTree
                data={chapterTree}
                title="章节目录"
                accent="gold"
                checkable
                checkedIds={metadataChapterIds}
                onCheck={setMetadataChapterIds}
                searchPlaceholder="搜索章节..."
                treeMaxHeightClassName="max-h-[420px]"
              />
            ) : (
              <div className="p-6 text-center text-xs text-ink-400">章节目录加载失败</div>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-ink-150">
            {knowledgeTree ? (
              <SearchableTree
                data={knowledgeTree}
                title="知识点目录"
                accent="teal"
                checkable
                checkedIds={metadataKnowledgePointIds}
                onCheck={setMetadataKnowledgePointIds}
                searchPlaceholder="搜索知识点..."
                treeMaxHeightClassName="max-h-[420px]"
              />
            ) : (
              <div className="p-6 text-center text-xs text-ink-400">知识点目录加载失败</div>
            )}
          </div>
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
  onUpdateStudentAnswer,
  onEditMetadata,
  visibility,
}: {
  question: Question | null | undefined;
  questionNumber: number;
  students: Student[];
  answerRecords: AnswerRecord[];
  onUpdateStudentAnswer: (studentId: string, questionId: string, score: AnswerScore | null) => Promise<void>;
  onEditMetadata?: (question: Question) => void;
  visibility: PreviewSidebarVisibility;
}) {
  if (!question) {
    return (
      <div className="rounded-lg border border-ink-100 bg-paper p-3 text-xs text-ink-400 shadow-sm">
        第 {questionNumber} 题属性加载失败
      </div>
    );
  }

  if (!visibility.properties && !visibility.answerStatus && !visibility.basket) return null;

  return (
    <div
      className="rounded-lg border border-ink-100 bg-paper p-3 shadow-sm"
      data-testid={`lecture-question-details-${questionNumber}`}
    >
      {visibility.properties && (
        <div data-testid={`lecture-question-properties-${questionNumber}`}>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-ink-500">第 {questionNumber} 题</span>
            <Badge variant="ink">{typeLabel[question.type] || question.type}</Badge>
            <Badge variant={difficultyVariant[question.difficulty] as "green" | "amber" | "red"}>
              {difficultyLabel[question.difficulty]}
            </Badge>
            {onEditMetadata && (
              <button
                type="button"
                onClick={() => onEditMetadata(question)}
                className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800"
                aria-label={`编辑第 ${questionNumber} 题章节与知识点`}
              >
                <Edit3 className="h-3 w-3" />
                编辑目录
              </button>
            )}
          </div>
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
      )}
      {visibility.answerStatus && (
        <StudentAnswerStatusControl
          className={cn(
            "mt-3",
            visibility.properties && "border-t border-ink-100 pt-3",
          )}
          students={students}
          answerRecords={answerRecords}
          questionId={question.id}
          onChange={onUpdateStudentAnswer}
        />
      )}
      {visibility.basket && (
        <div
          className={cn(
            "no-print mt-3",
            (visibility.properties || visibility.answerStatus) && "border-t border-ink-100 pt-3",
          )}
          data-testid={`lecture-question-basket-${questionNumber}`}
        >
          <AddToBasketDropdown
            resourceType="question"
            resourceId={question.id}
            resourceTitle={question.stem}
            size="sm"
            variant="outline"
            quickLabel="加入试题篮"
          />
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

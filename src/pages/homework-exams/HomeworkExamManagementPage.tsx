import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { OfficeDocumentHtml } from "@/components/resource/OfficeDocumentHtml";
import { BookCheck, ClipboardList, FileText, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScannerReviewPanel } from "./ScannerReviewPanel";
import { ThirdPartyCardEditor } from "@/components/scanner/ThirdPartyCardEditor";
import { scannerService, type ScannerPageRecord, type ThirdPartyCard } from "@/services/scanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { classService } from "@/services/class";
import { extractStoredFile } from "@/services/api";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { examPaperService } from "@/services/examPaper";
import { examPublishService } from "@/services/examPublish";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { toast } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomHomework, ExamPaper, ExamPaperQuestion, ExamPublication, HomeworkClassOverviewRecord, AnyClass, Student, ClassroomHomeworkAttachment } from "@/types";
import {
  homeworkStatus, homeworkSubmissionDetails, homeworkTitle, paperHomeworkStatus, publicationStatus,
} from "@/lib/homework-exam-management";

type Section = "homework" | "exams";
type ManagedRecord =
  | { kind: "classroom"; item: ClassroomHomework }
  | { kind: "paper"; item: ExamPaper };

type EditForm = {
  title: string;
  category: "homework" | "exam";
  classIds: string[];
  startDate: string;
  endDate: string;
  publishAt: string;
};

type ResizableColumn = "title" | "filename" | "audience";
type ColumnWidths = Record<ResizableColumn, number>;
const COLUMN_WIDTHS_KEY = "inteschool:homework-management:column-widths:v1";
const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { title: 224, filename: 256, audience: 224 };
const MIN_COLUMN_WIDTH = 120;
const MAX_COLUMN_WIDTH = 720;
const OTHER_COLUMN_WIDTHS = [96, 80, 80, 192, 192, 96, 260];

function clampColumnWidth(value: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(value)));
}

function readColumnWidths(): ColumnWidths {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY) || "null");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      const values = stored as Record<string, unknown>;
      return Object.fromEntries((Object.keys(DEFAULT_COLUMN_WIDTHS) as ResizableColumn[]).map((key) => [
        key, typeof values[key] === "number" && Number.isFinite(values[key])
          ? clampColumnWidth(values[key]) : DEFAULT_COLUMN_WIDTHS[key],
      ])) as ColumnWidths;
    }
  } catch { /* Storage may be disabled. */ }
  return { ...DEFAULT_COLUMN_WIDTHS };
}

function scanStatus(records: ScannerPageRecord[], paperId: string): "未扫描" | "已扫描未复查" | "扫描已复查" {
  const matching = records.filter((record) => record.sheetType === "paper" && record.sheetId === paperId);
  if (matching.length === 0) return "未扫描";
  return matching.every((record) => !!record.reviewedAt) ? "扫描已复查" : "已扫描未复查";
}

const statusVariant = (status: string) => {
  if (status === "进行中" || status === "已发布") return "green" as const;
  if (status === "待开始" || status === "待发布" || status === "保密中" || status === "草稿") return "amber" as const;
  return "ink" as const;
};

function dateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function dateRange(start?: string, end?: string): string {
  if (!start) return "—";
  return !end || start === end ? start : `${start} 至 ${end}`;
}

function fileName(record: ManagedRecord): string {
  return record.kind === "paper"
    ? record.item.originalFileName || record.item.title || "—"
    : record.item.attachments?.map((attachment) => attachment.name).join("、") || "—";
}

function paperPreviewUrl(paper: ExamPaper): string {
  return paper.originalFileUrl
    ? `/resources/preview/${encodeURIComponent(paper.id)}?type=examPaper`
    : `/exam-papers/${encodeURIComponent(paper.id)}/preview`;
}

function AttachmentPreview({ attachment }: { attachment: ClassroomHomeworkAttachment }) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const isWord = /\.docx$/i.test(attachment.name);

  useEffect(() => {
    if (!isWord) return;
    let cancelled = false;
    void extractStoredFile(attachment.url).then((result) => {
      if (!cancelled) setHtml(result.html);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "预览失败");
    });
    return () => { cancelled = true; };
  }, [attachment.url, isWord]);

  if (isWord) {
    return error ? <p role="alert" className="text-sm text-red-600">{error}</p>
      : html ? <OfficeDocumentHtml html={html} /> : <Spinner size={24} />;
  }
  if (/\.(png|jpe?g|gif|webp)$/i.test(attachment.name)) {
    return <img src={attachment.url} alt={attachment.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />;
  }
  if (/\.pdf$/i.test(attachment.name)) {
    return <iframe title={attachment.name} src={attachment.url} className="h-[70vh] w-full" />;
  }
  return <p className="text-sm text-ink-600">此格式不支持在线预览，可打开原文件查看。</p>;
}

function recordTitle(record: ManagedRecord): string {
  return record.kind === "paper" ? record.item.title : homeworkTitle(record.item);
}

function recordStatus(record: ManagedRecord, now: Date): string {
  return record.kind === "paper" ? paperHomeworkStatus(record.item, now) : homeworkStatus(record.item, now);
}

function choiceQuestions(paper: ExamPaper): ExamPaperQuestion[] {
  return paper.questions.filter((question) => question.type === "single" || question.type === "multiple");
}

function hasChoiceAnswers(paper: ExamPaper): boolean {
  const questions = choiceQuestions(paper);
  return questions.length > 0 && questions.every((question) => question.answer?.trim());
}

function normalizeChoiceAnswer(question: ExamPaperQuestion, raw: string): string | null {
  const value = raw.toUpperCase().replace(/[\s,，、]/g, "");
  if (!/^[A-Z]*$/.test(value) || (question.type === "single" && value.length > 1)) return null;
  if (new Set(value).size !== value.length) return null;
  if (question.options?.length && [...value].some((letter) => letter.charCodeAt(0) - 65 >= question.options!.length)) return null;
  return [...value].sort().join("");
}

export default function HomeworkExamManagementPage({ section }: { section: Section }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = teacher ? getCurrentAffiliation() : null;
  const schoolId = affiliation?.schoolId || teacher?.schoolId || null;
  const teacherId = teacher?.id;
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [thirdPartyCards, setThirdPartyCards] = useState<ThirdPartyCard[]>([]);
  const [scannerPages, setScannerPages] = useState<ScannerPageRecord[]>([]);
  const [scannerError, setScannerError] = useState(false);
  const [scanPaper, setScanPaper] = useState<ExamPaper | null>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(readColumnWidths);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const tableWidth = Math.max(1600, Object.values(columnWidths).reduce((total, width) => total + width, 0)
    + OTHER_COLUMN_WIDTHS.reduce((total, width) => total + width, 0));

  useEffect(() => {
    try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths)); }
    catch { /* Storage may be disabled. */ }
  }, [columnWidths]);
  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const resizeColumn = (key: ResizableColumn, event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const start = event.clientX;
    const width = columnWidths[key];
    const move = (pointer: PointerEvent) => setColumnWidths((current) => ({
      ...current, [key]: clampColumnWidth(width + pointer.clientX - start),
    }));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      resizeCleanupRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    resizeCleanupRef.current = stop;
  };
  const syncScroll = (source: "top" | "table") => {
    const from = source === "top" ? topScrollRef.current : tableScrollRef.current;
    const to = source === "top" ? tableScrollRef.current : topScrollRef.current;
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };
  const onScannerRecordsChange = useCallback((records: ScannerPageRecord[]) => {
    setScannerPages(records);
    setScannerError(false);
  }, []);
  const [editingCard, setEditingCard] = useState<ThirdPartyCard | null>(null);
  const [cardSaving, setCardSaving] = useState(false);
  const [publications, setPublications] = useState<ExamPublication[]>([]);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Map<string, HomeworkClassOverviewRecord[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<ManagedRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [missingList, setMissingList] = useState<{ title: string; students: { classId: string; studentId: string }[] } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ClassroomHomeworkAttachment | null>(null);
  const [answerPaper, setAnswerPaper] = useState<ExamPaper | null>(null);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [answerLoadingId, setAnswerLoadingId] = useState<string | null>(null);
  const [answerSaving, setAnswerSaving] = useState(false);

  useEffect(() => {
    setQuery("");
    setStatusFilter("all");
    setEditing(null);
    setMissingList(null);
    setPreviewAttachment(null);
    setAnswerPaper(null);
    setScanPaper(null);
  }, [section]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHomeworks([]);
    setPapers([]);
    setThirdPartyCards([]);
    setScannerPages([]);
    setScannerError(false);
    setStudents([]);
    setPublications([]);
    setAttendance(new Map());
    if (!schoolId || !teacherId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const [classItems, homeworkItems, paperItems, publicationItems, studentResult, scannedItems, scannerResult] = await Promise.all([
          classService.listAllClasses(schoolId, teacherId),
          classroomHomeworkService.listHomeworks({ schoolId, teacherId }),
          examPaperService.listPapers({ schoolId, teacherId }),
          section === "exams" ? examPublishService.listPublications(schoolId) : Promise.resolve([]),
          (section === "exams" ? classService.listStudentsBySchool(schoolId) : classService.listMyStudents(schoolId, teacherId)).catch(() => [] as Student[]),
          section === "homework" ? scannerService.listThirdPartyCards(schoolId) : Promise.resolve([]),
          section === "homework" ? scannerService.listPages(schoolId).then((records) => ({ records, failed: false }))
            .catch(() => ({ records: [] as ScannerPageRecord[], failed: true })) : Promise.resolve({ records: [] as ScannerPageRecord[], failed: false }),
        ]);
        const classIds = section === "homework"
          ? [...new Set(homeworkItems.filter((item) => item.managementCategory !== "exam"
            && (item.assignedEndDate || item.assignedDate) === item.assignedDate).flatMap((item) => item.classIds))]
          : [];
        const overviews = await Promise.allSettled(classIds.map((id) =>
          homeworkRecordService.listClassOverviews(id)));
        if (cancelled) return;
        setClasses(classItems);
        setStudents(studentResult);
        setHomeworks(homeworkItems);
        setPapers(paperItems);
        setThirdPartyCards(scannedItems);
        setScannerPages(scannerResult.records);
        setScannerError(scannerResult.failed);
        setPublications(publicationItems.filter((item) =>
          item.publisherId === teacherId && item.publisherSchoolId === schoolId));
        setAttendance(new Map(classIds.map((id, index) => [
          id,
          overviews[index].status === "fulfilled" ? overviews[index].value : [],
        ])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [schoolId, teacherId, section, refreshKey]);

  const classNames = useMemo(() => new Map(classes.map((item) => [
    item.id, item.type === "personal" ? `个人班级 · ${item.name}` : `${item.grade} · ${item.name}`,
  ])), [classes]);

  const studentNames = useMemo(() => new Map(students.map((item) => [item.id, item])), [students]);
  const audienceLabel = (record: ManagedRecord) => {
    const classIds = record.item.classIds || [];
    if (classIds.length) return `班级：${classIds.map((id) => classNames.get(id) || id).join("、")}`;
    if (record.kind === "paper" && record.item.studentIds?.length) {
      return `个人：${record.item.studentIds.map((id) => studentNames.get(id)?.name || `学生（${id}）`).join("、")}`;
    }
    return "未指定";
  };

  const isHomework = section === "homework";
  const now = new Date();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesRecord = (record: ManagedRecord) => {
    const status = recordStatus(record, now);
    const searchText = [
      recordTitle(record), fileName(record),
      record.kind === "classroom" ? record.item.content : record.item.description || "",
      audienceLabel(record),
    ].join(" ").toLocaleLowerCase();
    return (statusFilter === "all" || status === statusFilter) && searchText.includes(normalizedQuery);
  };

  const managedRecords: ManagedRecord[] = [
    ...homeworks.filter((item) => (item.managementCategory === "exam") !== isHomework)
      .map((item): ManagedRecord => ({ kind: "classroom", item })),
    ...papers.filter((item) => (item.managementCategory === "exam") !== isHomework
      && (!isHomework || (!item.originalFileUrl && !item.isExtractCopy)))
      .map((item): ManagedRecord => ({ kind: "paper", item })),
  ].filter(matchesRecord).sort((left, right) =>
    right.item.updatedAt.localeCompare(left.item.updatedAt));

  const categorizedPaperIds = new Set(papers.filter((item) =>
    item.managementCategory === "exam").map((item) => item.id));
  const displayedPublications = isHomework ? [] : publications.filter((item) => {
    if (categorizedPaperIds.has(item.examPaperId)) return false;
    const status = publicationStatus(item, now);
    return (statusFilter === "all" || status === statusFilter)
      && item.title.toLocaleLowerCase().includes(normalizedQuery);
  });
  const visibleRecords = managedRecords;
  const visibleScannedCards = isHomework ? thirdPartyCards.filter((card) =>
    (statusFilter === "all" || statusFilter === "草稿")
    && [card.fileName, papers.find((paper) => paper.id === card.paperId)?.title || ""].join(" ").toLocaleLowerCase().includes(normalizedQuery)) : [];

  const saveCard = async (patch: { fileName: string; paperId: string | null; regions: ThirdPartyCard["regions"] }) => {
    if (!editingCard) return;
    setCardSaving(true);
    try {
      const updated = await scannerService.updateThirdPartyCard(editingCard.id, patch);
      setThirdPartyCards((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditingCard(null);
      toast.success("第三方卡标注已保存");
    } catch (err) {
      toast.error("保存第三方卡失败", err instanceof Error ? err.message : undefined);
    } finally {
      setCardSaving(false);
    }
  };

  const beginEdit = (record: ManagedRecord) => {
    const item = record.item;
    setEditing(record);
    setEditForm({
      title: recordTitle(record),
      category: item.managementCategory || "homework",
      classIds: item.classIds || [],
      startDate: item.assignedDate || "",
      endDate: item.assignedEndDate || item.assignedDate || "",
      publishAt: record.kind === "classroom" ? record.item.publishAt : "",
    });
  };

  const openAnswers = async (paper: ExamPaper) => {
    setAnswerLoadingId(paper.id);
    try {
      const latest = await examPaperService.getPaper(paper.id);
      if (!latest) throw new Error("试卷不存在");
      setAnswerPaper(latest);
      setAnswerDraft(Object.fromEntries(choiceQuestions(latest).map((question) => [question.id, question.answer || ""])));
    } catch (err) {
      toast.error("加载答案失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setAnswerLoadingId(null);
    }
  };

  const saveAnswers = async () => {
    if (!answerPaper) return;
    const answers = new Map<string, string>();
    for (const [index, question] of answerPaper.questions.entries()) {
      if (question.type !== "single" && question.type !== "multiple") continue;
      const answer = normalizeChoiceAnswer(question, answerDraft[question.id] || "");
      if (answer === null) {
        toast.warning(`第 ${index + 1} 题答案格式不正确，请填写有效选项字母`);
        return;
      }
      answers.set(question.id, answer);
    }
    const questions = answerPaper.questions.map((question) =>
      answers.has(question.id) ? { ...question, answer: answers.get(question.id)! } : question);
    if (questions.every((question, index) => question.answer === answerPaper.questions[index].answer)) {
      setAnswerPaper(null);
      return;
    }
    setAnswerSaving(true);
    try {
      const updated = await examPaperService.updatePaper(answerPaper.id, { questions });
      setPapers((current) => current.map((paper) => paper.id === updated.id ? updated : paper));
      setAnswerPaper(null);
      toast.success("选择题答案已保存");
    } catch (err) {
      toast.error("保存答案失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setAnswerSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editForm || !teacherId || !schoolId) return;
    if (!editForm.title.trim()) {
      toast.warning("请输入作业名称");
      return;
    }
    if (editForm.endDate && (!editForm.startDate || editForm.endDate < editForm.startDate)) {
      toast.warning("结束日期不能早于开始日期");
      return;
    }
    if (editing.kind === "classroom" && (!editForm.startDate || !editForm.classIds.length)) {
      toast.warning("班级作业必须设置日期并选择班级");
      return;
    }

    setSaving(true);
    try {
      if (editing.kind === "paper") {
        await examPaperService.updatePaper(editing.item.id, {
          title: editForm.title.trim(),
          managementCategory: editForm.category,
          classIds: editForm.classIds,
          assignedDate: editForm.startDate || undefined,
          assignedEndDate: editForm.startDate ? editForm.endDate || editForm.startDate : undefined,
        });
      } else {
        await classroomHomeworkService.updateHomework(editing.item.id, teacherId, schoolId, {
          title: editForm.title.trim(),
          managementCategory: editForm.category,
          content: editing.item.content,
          attachments: editing.item.attachments,
          classIds: editForm.classIds,
          assignedDate: editForm.startDate,
          assignedEndDate: editForm.endDate || editForm.startDate,
          publishAt: editForm.publishAt,
        });
      }
      setEditing(null);
      setEditForm(null);
      setRefreshKey((value) => value + 1);
      toast.success("作业信息已更新");
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title={isHomework ? "作业管理" : "考试管理"}
        description={isHomework ? "管理班级作业及试卷库中的作业文档、使用对象与时间安排。" : "查看考试试卷、考试发布记录与使用对象。"}
        icon={isHomework ? <BookCheck className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
        action={<>
          {!isHomework && <Link to="/homework-exams/exams/blank-answer-sheet" className="btn-gold flex items-center gap-1.5 px-3 py-2 text-sm"><FileText className="h-4 w-4" />制作空白答题卡</Link>}
          {isHomework && <Link to="/scanner" className="btn-outline flex items-center gap-1.5 px-3 py-2 text-sm">扫描第三方卡</Link>}
          {isHomework && <Link to="/my-resources/exam-papers?create=homework" className="btn-gold flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" />出作业</Link>}
          <Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}><RefreshCw className="h-4 w-4" />刷新</Button>
        </>}
      />
      <div className="mb-5 flex gap-2 rounded-xl border border-ink-100 bg-paper p-1.5">
        <Link to="/homework-exams/homework" className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium ${isHomework ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-mist"}`}>作业管理</Link>
        <Link to="/homework-exams/exams" className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium ${!isHomework ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-mist"}`}>考试管理</Link>
      </div>
      {!isHomework && schoolId && <ScannerReviewPanel schoolId={schoolId} students={students} />}
      {!schoolId ? (
        <Card><p className="py-10 text-center text-sm text-ink-500">请切换到学校身份后查看作业考试。</p></Card>
      ) : loading ? (
        <div className="flex min-h-60 items-center justify-center"><Spinner size={32} /></div>
      ) : error ? (
        <Card><p role="alert" className="text-sm text-red-600">加载失败：{error}</p><Button className="mt-3" variant="outline" onClick={() => setRefreshKey((key) => key + 1)}>重试</Button></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
            <input
              aria-label={isHomework ? "搜索作业" : "搜索考试"}
              placeholder={isHomework ? "搜索作业名称、文件或班级" : "搜索考试名称"}
              className="min-w-48 flex-1 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-400 focus:outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select aria-label="筛选状态" className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">全部状态</option>
              {(isHomework ? ["草稿", "待发布", "待开始", "进行中", "已结束"] : ["草稿", "保密中", "已发布", "已到期", "已撤回", "待开始", "进行中", "已结束"]).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <Link to={isHomework ? "/my-lessons?tab=homework" : "/my-resources/exam-papers"} className="btn-gold flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" />{isHomework ? "布置作业" : "查看试卷库"}</Link>
          </div>
          {isHomework && <div ref={topScrollRef} onScroll={() => syncScroll("top")}
            className="overflow-x-auto border-b border-ink-100" role="region" tabIndex={0} aria-label="作业管理表格上方横向滚动条">
            <div style={{ width: tableWidth, height: 1 }} aria-hidden="true" />
          </div>}
          {scannerError && isHomework && <p role="alert" className="px-4 py-2 text-sm text-red-600">扫描记录加载失败，暂时无法显示扫描状态。请刷新重试。</p>}
          <div ref={tableScrollRef} onScroll={() => syncScroll("table")} className="overflow-x-auto" aria-label={isHomework ? "作业管理表格，可横向滚动查看后续列" : "考试管理表格"} role="region" tabIndex={0}>
            <table className={`text-left text-sm ${isHomework ? "min-w-[1600px] table-fixed" : "w-full min-w-[1000px]"}`} style={isHomework ? { width: tableWidth } : undefined}>
              {isHomework && <colgroup>
                <col style={{ width: columnWidths.title }} /><col style={{ width: columnWidths.filename }} /><col style={{ width: columnWidths.audience }} />
                {OTHER_COLUMN_WIDTHS.map((width, index) => <col key={index} style={{ width }} />)}
              </colgroup>}
              <thead className="bg-ink-50 text-ink-700">
                {isHomework ? (
                  <tr>{["作业名称", "作业文件名", "使用对象", "答案", "已交", "未交", "作业时间", "发布时间", "状态", "操作"].map((title, index) => {
                    const key: ResizableColumn | null = index === 0 ? "title" : index === 1 ? "filename" : index === 2 ? "audience" : null;
                    return <th key={title} scope="col" style={index === 1 ? { left: columnWidths.title } : undefined}
                      className={`whitespace-nowrap px-4 py-3 font-medium ${index === 0 ? "sticky left-0 z-10 bg-ink-50" : index === 1 ? "sticky z-10 bg-ink-50" : "relative"}`}>
                      {title}
                      {key && <span role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`调整${title}列宽`}
                        aria-valuemin={MIN_COLUMN_WIDTH} aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={columnWidths[key]}
                        onPointerDown={(event) => resizeColumn(key, event)}
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                          event.preventDefault();
                          setColumnWidths((current) => ({ ...current, [key]: clampColumnWidth(current[key] + (event.key === "ArrowRight" ? 16 : -16)) }));
                        }} className="absolute inset-y-1 right-0 z-20 w-2 cursor-col-resize touch-none rounded hover:bg-teal-200 focus:bg-teal-200 focus:outline-none" />}
                    </th>;
                  })}</tr>
                ) : (
                  <tr>{["考试名称", "使用对象", "类型", "发布时间", "解锁时间", "状态", "操作"].map((title) => <th key={title} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{title}</th>)}</tr>
                )}
              </thead>
              <tbody className="divide-y divide-ink-100">
                {isHomework ? <>
                  {visibleScannedCards.map((card) => (
                    <tr key={`third-party-${card.id}`} className="group align-top hover:bg-mist/40">
                      <td className="sticky left-0 z-10 break-words bg-paper px-4 py-3 font-medium text-ink-900 group-hover:bg-mist">{card.fileName}<span className="ml-2 text-xs font-normal text-ink-500">第三方卡</span></td>
                      <td style={{ left: columnWidths.title }} className="sticky z-10 break-all bg-paper px-4 py-3 group-hover:bg-mist"><button className="text-teal-700 hover:underline" onClick={() => setEditingCard(card)}>{card.fileName}</button></td>
                      <td className="px-4 py-3 text-ink-600">{papers.find((paper) => paper.id === card.paperId)?.title || "未关联试卷"}</td>
                      <td className="px-4 py-3 text-ink-600">—</td>
                      <td className="px-4 py-3 text-ink-600">—</td>
                      <td className="px-4 py-3 text-ink-600">—</td>
                      <td className="px-4 py-3 text-ink-600">—</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTime(card.createdAt)}</td>
                      <td className="px-4 py-3"><Badge variant="amber">草稿</Badge></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3 whitespace-nowrap">
                        <button className="text-teal-700 hover:underline" onClick={() => setEditingCard(card)}>编辑标注</button>
                        {card.paperId && papers.find((paper) => paper.id === card.paperId) && (
                          <button type="button" disabled={scannerError} className="text-teal-700 hover:underline disabled:opacity-50"
                            onClick={() => setScanPaper(papers.find((paper) => paper.id === card.paperId)!)}>
                            {scannerError ? "扫描状态未知" : scanStatus(scannerPages, card.paperId)}
                          </button>
                        )}
                      </div></td>
                    </tr>
                  ))}
                  {visibleRecords.map((record) => {
                    const status = recordStatus(record, now);
                    const counts = record.kind === "classroom" ? homeworkSubmissionDetails(record.item, attendance) : null;
                    return (
                    <tr key={`${record.kind}-${record.item.id}`} className="group align-top hover:bg-mist/40">
                      <td className="sticky left-0 z-10 break-words bg-paper px-4 py-3 font-medium text-ink-900 group-hover:bg-mist">{recordTitle(record)}</td>
                      <td style={{ left: columnWidths.title }} className="sticky z-10 break-all bg-paper px-4 py-3 text-ink-600 group-hover:bg-mist">
                        {record.kind === "paper" ? (
                          <Link className="text-teal-700 hover:underline" to={paperPreviewUrl(record.item)}>{fileName(record)}</Link>
                        ) : record.item.attachments?.length ? (
                          <div className="flex flex-col gap-1">{record.item.attachments.map((attachment) => (
                            <button type="button" key={attachment.id} className="text-left text-teal-700 hover:underline" onClick={() => setPreviewAttachment(attachment)}>{attachment.name}</button>
                          ))}</div>
                        ) : "—"}
                      </td>
                      <td className="break-words px-4 py-3 text-ink-600">{audienceLabel(record)}</td>
                      <td className="px-4 py-3">
                        {record.kind === "paper" ? (
                          <button type="button" className="text-teal-700 hover:underline disabled:cursor-wait disabled:opacity-50"
                            disabled={answerLoadingId === record.item.id}
                            onClick={() => void openAnswers(record.item)}
                            aria-label={`查看或编辑「${record.item.title}」选择题答案：${hasChoiceAnswers(record.item) ? "有" : "无"}`}
                          >{answerLoadingId === record.item.id ? "加载中" : hasChoiceAnswers(record.item) ? "有" : "无"}</button>
                        ) : <span className="text-ink-500">无</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-700">{counts?.submitted ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-700">{counts && counts.missing > 0 ? (
                        <button type="button" className="text-teal-700 underline-offset-2 hover:underline" onClick={() => setMissingList({ title: recordTitle(record), students: counts.missingStudents })}>{counts.missing}</button>
                      ) : counts?.missing ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateRange(record.item.assignedDate, record.item.assignedEndDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTime(record.kind === "classroom" ? record.item.publishAt : record.item.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><Badge variant={statusVariant(status)}>{status}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3"><div className="flex items-center gap-3"><button type="button" className="text-teal-700 hover:underline" onClick={() => beginEdit(record)}>编辑</button><Link to="/my-students?tab=homework" className="text-teal-700 hover:underline">作业记录</Link>{record.kind === "paper" && <button type="button" disabled={scannerError}
                        className="text-teal-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setScanPaper(record.item)}
                        aria-label={`查看「${record.item.title}」答题卡扫描情况：${scannerError ? "加载失败" : scanStatus(scannerPages, record.item.id)}`}>
                        {scannerError ? "扫描状态未知" : scanStatus(scannerPages, record.item.id)}
                      </button>}</div></td>
                    </tr>
                  );
                })}</> : <>
                  {displayedPublications.map((item) => {
                    const status = publicationStatus(item, now);
                    const targets = item.targetType === "otherSchool"
                      ? `${item.targetSchoolIds.length} 所学校`
                      : [item.targetClassIds.map((id) => classNames.get(id) || id).join("、"), item.targetStudentIds?.length ? `${item.targetStudentIds.length} 名指定学生` : ""].filter(Boolean).join("；") || "—";
                    return (
                      <tr key={item.id} className="align-top hover:bg-mist/40">
                        <td className="max-w-72 break-words px-4 py-3 font-medium text-ink-900">{item.title}</td>
                        <td className="max-w-64 break-words px-4 py-3 text-ink-600">{targets}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-600">{item.isFormalExam ? "正规考试" : "普通试卷"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTime(item.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTime(item.unlockAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3"><Badge variant={statusVariant(status)}>{status}</Badge></td>
                        <td className="whitespace-nowrap px-4 py-3"><Link to={`/exam-papers/${encodeURIComponent(item.examPaperId)}`} className="text-teal-700 hover:underline">查看 / 管理</Link></td>
                      </tr>
                    );
                  })}
                  {visibleRecords.map((record) => {
                    const status = recordStatus(record, now);
                    return (
                      <tr key={`${record.kind}-${record.item.id}`} className="align-top hover:bg-mist/40">
                        <td className="max-w-72 break-words px-4 py-3 font-medium text-ink-900">{recordTitle(record)}</td>
                        <td className="max-w-64 px-4 py-3 text-ink-600">{record.item.classIds?.map((id) => classNames.get(id) || id).join("、") || "—"}</td>
                        <td className="px-4 py-3 text-ink-600">{record.kind === "paper" ? "考试试卷" : "班级作业"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTime(record.kind === "paper" ? record.item.createdAt : record.item.publishAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateRange(record.item.assignedDate, record.item.assignedEndDate)}</td>
                        <td className="px-4 py-3"><Badge variant={statusVariant(status)}>{status}</Badge></td>
                        <td className="whitespace-nowrap px-4 py-3"><div className="flex items-center gap-3"><button type="button" className="text-teal-700 hover:underline" onClick={() => beginEdit(record)}>编辑</button><Link to="/my-students?tab=homework" className="text-teal-700 hover:underline">作业记录</Link></div></td>
                      </tr>
                    );
                  })}
                </>}
              </tbody>
            </table>
          </div>
          {(visibleRecords.length + displayedPublications.length + visibleScannedCards.length) === 0 && (
            <p className="px-4 py-12 text-center text-sm text-ink-500">{query || statusFilter !== "all" ? "没有符合筛选条件的记录" : isHomework ? "暂无作业" : "暂无已管理的考试"}</p>
          )}
          {isHomework && <p className="border-t border-ink-100 px-4 py-3 text-xs text-ink-400">未交人数来自班级当日作业点名（未交不含请假学生），不区分同日不同作业；点击未交人数可查看名单。未点名、跨日期或尚未布置的文档显示“—”。</p>}
        </Card>
      )}
      <Modal open={!!scanPaper} onClose={() => setScanPaper(null)} title={`答题卡扫描情况 · ${scanPaper?.title || ""}`}
        description="仅显示这份试卷的答题卡扫描记录；修改学生匹配或复查状态后会同步更新列表。" size="xl">
        {scanPaper && schoolId && <ScannerReviewPanel key={scanPaper.id} schoolId={schoolId} students={students}
          sheetId={scanPaper.id} onRecordsChange={onScannerRecordsChange} />}
      </Modal>
      {editingCard && <ThirdPartyCardEditor key={editingCard.id} card={editingCard} papers={papers.filter((paper) => paper.teacherId === teacherId && paper.schoolId === schoolId)} saving={cardSaving} onClose={() => setEditingCard(null)} onSave={(patch) => void saveCard(patch)} />}
      <Modal open={!!missingList} onClose={() => setMissingList(null)} title={`未交作业名单 · ${missingList?.title || ""}`} description={`共 ${missingList?.students.length || 0} 人，已排除请假学生`}>
        <div className="divide-y divide-ink-100">
          {missingList?.students.map(({ classId, studentId }) => {
            const student = studentNames.get(studentId);
            return <div key={`${classId}-${studentId}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-ink-900">{student?.name || `学生（${studentId}）`}{student?.studentNo ? `（${student.studentNo}）` : ""}</span>
              <span className="text-ink-500">{classNames.get(classId) || classId}</span>
            </div>;
          })}
        </div>
      </Modal>
      <Modal open={!!previewAttachment} onClose={() => setPreviewAttachment(null)} title={previewAttachment?.name || "文件预览"} size="xl" footer={previewAttachment && <a className="text-sm text-teal-700 hover:underline" href={previewAttachment.url} target="_blank" rel="noopener noreferrer">打开原文件</a>}>
        {previewAttachment && <AttachmentPreview key={previewAttachment.id} attachment={previewAttachment} />}
      </Modal>
      <Modal
        open={!!answerPaper}
        onClose={() => { if (!answerSaving) setAnswerPaper(null); }}
        title={`选择题答案 · ${answerPaper?.title || ""}`}
        description="查看并编辑试卷的单选题、多选题答案；所有选择题均填写后列表显示“有”。"
        size="lg"
        footer={<>
          <Button variant="outline" disabled={answerSaving} onClick={() => setAnswerPaper(null)}>取消</Button>
          <Button disabled={answerSaving || !answerPaper || choiceQuestions(answerPaper).length === 0} loading={answerSaving} onClick={() => void saveAnswers()}>保存答案</Button>
        </>}
      >
        {answerPaper && (choiceQuestions(answerPaper).length === 0 ? (
          <p className="text-sm text-ink-500">该试卷暂无选择题，请在试卷编辑器中添加题目。</p>
        ) : (
          <div className="space-y-5">
            {answerPaper.questions.map((question, index) => {
              if (question.type !== "single" && question.type !== "multiple") return null;
              return (
                <div key={question.id} className="space-y-2 rounded-lg border border-ink-100 p-4">
                  <p className="break-words text-sm font-medium text-ink-800">第 {index + 1} 题 · {question.type === "single" ? "单选" : "多选"}：{question.stem}</p>
                  {!!question.options?.length && (
                    <div className="space-y-1 text-xs text-ink-600">
                      {question.options.map((option, optionIndex) =>
                        <p key={optionIndex} className="break-words">{String.fromCharCode(65 + optionIndex)}. {option}</p>)}
                    </div>
                  )}
                  <Input
                    label={`第 ${index + 1} 题答案`}
                    placeholder={question.type === "single" ? "如 A" : "如 AC"}
                    value={answerDraft[question.id] || ""}
                    onChange={(event) => setAnswerDraft((current) => ({ ...current, [question.id]: event.target.value.toUpperCase() }))}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </Modal>
      <Modal
        open={!!editing && !!editForm}
        onClose={() => { if (!saving) setEditing(null); }}
        title="编辑作业信息"
        description={editing?.kind === "paper" ? "修改文档分类、使用对象与时间；原始试卷内容仍在文档编辑器中维护。" : "修改班级作业信息及归属分类。"}
        footer={<>
          <Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>取消</Button>
          <Button disabled={saving} loading={saving} onClick={() => void saveEdit()}>保存</Button>
        </>}
      >
        {editing && editForm && <div className="space-y-4">
          <Input label="作业名称" value={editForm.title} maxLength={120} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
          <Input label="作业文件名" value={fileName(editing)} readOnly />
          <div>
            <label htmlFor="management-category" className="mb-1.5 block text-sm font-medium text-ink-700">管理目录</label>
            <select id="management-category" className="input-base w-full" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as EditForm["category"] })}>
              <option value="homework">作业</option>
              <option value="exam">考试试卷</option>
            </select>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">使用对象（班级）</legend>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-ink-200 p-3">
              {classes.length ? classes.map((schoolClass) => <label key={schoolClass.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editForm.classIds.includes(schoolClass.id)} onChange={(e) => setEditForm({
                  ...editForm,
                  classIds: e.target.checked
                    ? [...editForm.classIds, schoolClass.id]
                    : editForm.classIds.filter((id) => id !== schoolClass.id),
                })} />
                {classNames.get(schoolClass.id)}
              </label>) : <p className="text-xs text-ink-500">暂无可用班级</p>}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Input label="开始日期" type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
            <Input label="结束日期" type="date" min={editForm.startDate || undefined} value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} />
          </div>
          {editing.kind === "classroom" && <Input label="发布时间" type="datetime-local" value={editForm.publishAt ? new Date(editForm.publishAt).toLocaleString("sv-SE", { hour12: false }).slice(0, 16).replace(" ", "T") : ""} onChange={(e) => { if (e.target.value) setEditForm({ ...editForm, publishAt: new Date(e.target.value).toISOString() }); }} />}
          <Link className="inline-block text-sm text-teal-700 hover:underline" to={editing.kind === "paper"
            ? `/exam-papers/${encodeURIComponent(editing.item.id)}`
            : `/my-lessons?tab=homework&edit=${encodeURIComponent(editing.item.id)}`}>
            编辑{editing.kind === "paper" ? "试卷内容" : "作业内容与附件"}
          </Link>
        </div>}
      </Modal>
    </div>
  );
}

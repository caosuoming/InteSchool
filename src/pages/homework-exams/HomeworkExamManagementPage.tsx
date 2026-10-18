import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { BookCheck, ClipboardList, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { examPaperService } from "@/services/examPaper";
import { examPublishService } from "@/services/examPublish";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { toast } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomHomework, ExamPaper, ExamPaperQuestion, ExamPublication, HomeworkClassOverviewRecord, SchoolClass } from "@/types";
import {
  homeworkStatus, homeworkSubmissionCounts, homeworkTitle, paperHomeworkStatus, publicationStatus,
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
    ? record.item.originalFileName || "—"
    : record.item.attachments?.map((attachment) => attachment.name).join("、") || "—";
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
  const [publications, setPublications] = useState<ExamPublication[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [attendance, setAttendance] = useState<Map<string, HomeworkClassOverviewRecord[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<ManagedRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [answerPaper, setAnswerPaper] = useState<ExamPaper | null>(null);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [answerLoadingId, setAnswerLoadingId] = useState<string | null>(null);
  const [answerSaving, setAnswerSaving] = useState(false);

  useEffect(() => {
    setQuery("");
    setStatusFilter("all");
    setEditing(null);
    setAnswerPaper(null);
  }, [section]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHomeworks([]);
    setPapers([]);
    setPublications([]);
    setAttendance(new Map());
    if (!schoolId || !teacherId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const [classItems, homeworkItems, paperItems, publicationItems] = await Promise.all([
          classService.listSchoolClasses(schoolId),
          classroomHomeworkService.listHomeworks({ schoolId, teacherId }),
          examPaperService.listPapers({ schoolId, teacherId }),
          section === "exams" ? examPublishService.listPublications(schoolId) : Promise.resolve([]),
        ]);
        const classIds = section === "homework"
          ? [...new Set(homeworkItems.filter((item) => item.managementCategory !== "exam"
            && (item.assignedEndDate || item.assignedDate) === item.assignedDate).flatMap((item) => item.classIds))]
          : [];
        const overviews = await Promise.allSettled(classIds.map((id) =>
          homeworkRecordService.listClassOverviews(id)));
        if (cancelled) return;
        setClasses(classItems);
        setHomeworks(homeworkItems);
        setPapers(paperItems);
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
    item.id, `${item.grade} · ${item.name}`,
  ])), [classes]);

  const isHomework = section === "homework";
  const now = new Date();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesRecord = (record: ManagedRecord) => {
    const status = recordStatus(record, now);
    const searchText = [
      recordTitle(record), fileName(record),
      record.kind === "classroom" ? record.item.content : record.item.description || "",
      record.item.classIds?.map((id) => classNames.get(id) || id).join(" ") || "",
    ].join(" ").toLocaleLowerCase();
    return (statusFilter === "all" || status === statusFilter) && searchText.includes(normalizedQuery);
  };

  const managedRecords: ManagedRecord[] = [
    ...homeworks.filter((item) => (item.managementCategory === "exam") !== isHomework)
      .map((item): ManagedRecord => ({ kind: "classroom", item })),
    ...papers.filter((item) => (item.managementCategory === "exam") !== isHomework)
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
          {isHomework && <Link to="/my-resources/exam-papers?create=homework" className="btn-gold flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" />出作业</Link>}
          <Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}><RefreshCw className="h-4 w-4" />刷新</Button>
        </>}
      />
      <div className="mb-5 flex gap-2 rounded-xl border border-ink-100 bg-paper p-1.5">
        <Link to="/homework-exams/homework" className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium ${isHomework ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-mist"}`}>作业管理</Link>
        <Link to="/homework-exams/exams" className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium ${!isHomework ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-mist"}`}>考试管理</Link>
      </div>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-ink-50 text-ink-700">
                {isHomework ? (
                  <tr>{["作业名称", "作业文件名", "使用对象", "答案", "已交", "未交", "作业时间", "发布时间", "状态", "操作"].map((title) => <th key={title} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{title}</th>)}</tr>
                ) : (
                  <tr>{["考试名称", "使用对象", "类型", "发布时间", "解锁时间", "状态", "操作"].map((title) => <th key={title} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{title}</th>)}</tr>
                )}
              </thead>
              <tbody className="divide-y divide-ink-100">
                {isHomework ? visibleRecords.map((record) => {
                  const status = recordStatus(record, now);
                  const counts = record.kind === "classroom" ? homeworkSubmissionCounts(record.item, attendance) : null;
                  return (
                    <tr key={`${record.kind}-${record.item.id}`} className="align-top hover:bg-mist/40">
                      <td className="max-w-72 break-words px-4 py-3 font-medium text-ink-900">{recordTitle(record)}</td>
                      <td className="max-w-64 break-all px-4 py-3 text-ink-600">{fileName(record)}</td>
                      <td className="max-w-56 px-4 py-3 text-ink-600">{record.item.classIds?.map((id) => classNames.get(id) || id).join("、") || "—"}</td>
                      <td className="px-4 py-3">
                        {record.kind === "paper" ? (
                          <button
                            type="button"
                            className="text-teal-700 hover:underline disabled:cursor-wait disabled:opacity-50"
                            disabled={answerLoadingId === record.item.id}
                            onClick={() => void openAnswers(record.item)}
                            aria-label={`查看或编辑「${record.item.title}」选择题答案：${hasChoiceAnswers(record.item) ? "有" : "无"}`}
                          >{answerLoadingId === record.item.id ? "加载中" : hasChoiceAnswers(record.item) ? "有" : "无"}</button>
                        ) : <span className="text-ink-500">无</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-700">{counts?.submitted ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-700">{counts?.missing ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateRange(record.item.assignedDate, record.item.assignedEndDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTime(record.kind === "classroom" ? record.item.publishAt : record.item.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><Badge variant={statusVariant(status)}>{status}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3"><button type="button" className="text-teal-700 hover:underline" onClick={() => beginEdit(record)}>编辑</button></td>
                    </tr>
                  );
                }) : <>
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
                        <td className="whitespace-nowrap px-4 py-3"><button type="button" className="text-teal-700 hover:underline" onClick={() => beginEdit(record)}>编辑</button></td>
                      </tr>
                    );
                  })}
                </>}
              </tbody>
            </table>
          </div>
          {(visibleRecords.length + displayedPublications.length) === 0 && (
            <p className="px-4 py-12 text-center text-sm text-ink-500">{query || statusFilter !== "all" ? "没有符合筛选条件的记录" : isHomework ? "暂无作业" : "暂无已管理的考试"}</p>
          )}
          {isHomework && <p className="border-t border-ink-100 px-4 py-3 text-xs text-ink-400">已交/未交来自班级当日作业点名（未交不含请假学生），不区分同日不同作业；未点名、跨日期或尚未布置的文档显示“—”。</p>}
        </Card>
      )}
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

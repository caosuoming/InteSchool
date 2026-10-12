import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { BookCheck, ClipboardList, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { examPublishService } from "@/services/examPublish";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomHomework, ExamPublication, HomeworkClassOverviewRecord, SchoolClass } from "@/types";
import { homeworkStatus, homeworkSubmissionCounts, homeworkTitle, publicationStatus } from "@/lib/homework-exam-management";

type Section = "homework" | "exams";

const statusVariant = (status: string) => {
  if (status === "进行中" || status === "已发布") return "green" as const;
  if (status === "待开始" || status === "待发布" || status === "保密中") return "amber" as const;
  return "ink" as const;
};

function dateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function homeworkDateLabel(item: ClassroomHomework): string {
  const end = item.assignedEndDate || item.assignedDate;
  return item.assignedDate === end ? end : `${item.assignedDate} 至 ${end}`;
}

export default function HomeworkExamManagementPage({ section }: { section: Section }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = teacher ? getCurrentAffiliation() : null;
  const schoolId = affiliation ? affiliation.schoolId : teacher?.schoolId || null;
  const teacherId = teacher?.id;
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [publications, setPublications] = useState<ExamPublication[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [attendance, setAttendance] = useState<Map<string, HomeworkClassOverviewRecord[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setQuery("");
    setStatusFilter("all");
  }, [section]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHomeworks([]);
    setPublications([]);
    setAttendance(new Map());
    if (!schoolId || !teacherId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const classPromise = classService.listSchoolClasses(schoolId);
        if (section === "homework") {
          const [classItems, homeworkItems] = await Promise.all([
            classPromise,
            classroomHomeworkService.listHomeworks({ schoolId, teacherId }),
          ]);
          const classIds = [...new Set(homeworkItems.filter((item) =>
            (item.assignedEndDate || item.assignedDate) === item.assignedDate,
          ).flatMap((item) => item.classIds))];
          const overviewResults = await Promise.allSettled(classIds.map((id) =>
            homeworkRecordService.listClassOverviews(id)));
          if (cancelled) return;
          setClasses(classItems);
          setHomeworks(homeworkItems);
          setAttendance(new Map(classIds.map((id, index) => [
            id,
            overviewResults[index].status === "fulfilled" ? overviewResults[index].value : [],
          ])));
        } else {
          const [classItems, publicationItems] = await Promise.all([
            classPromise,
            examPublishService.listPublications(schoolId),
          ]);
          if (cancelled) return;
          setClasses(classItems);
          setPublications(publicationItems.filter((item) =>
            item.publisherId === teacherId && item.publisherSchoolId === schoolId));
        }
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
  const now = new Date();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredHomeworks = homeworks.filter((item) => {
    const status = homeworkStatus(item, now);
    return (statusFilter === "all" || status === statusFilter)
      && `${item.title || ""} ${item.content} ${item.attachments?.map((attachment) => attachment.name).join(" ") || ""} ${item.classIds.map((id) => classNames.get(id) || id).join(" ")}`
        .toLocaleLowerCase().includes(normalizedQuery);
  });
  const filteredPublications = publications.filter((item) => {
    const status = publicationStatus(item, now);
    return (statusFilter === "all" || status === statusFilter)
      && item.title.toLocaleLowerCase().includes(normalizedQuery);
  });

  const isHomework = section === "homework";
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title={isHomework ? "作业管理" : "考试管理"}
        description={isHomework ? "汇总自己布置的班级作业、展示日期和点名情况。" : "查看自己发布的试卷、发布对象与发布状态。"}
        icon={isHomework ? <BookCheck className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
        action={<Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}><RefreshCw className="h-4 w-4" />刷新</Button>}
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
              placeholder={isHomework ? "搜索作业内容、附件或班级" : "搜索考试名称"}
              className="min-w-48 flex-1 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-400 focus:outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select aria-label="筛选状态" className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">全部状态</option>
              {(isHomework ? ["待发布", "待开始", "进行中", "已结束"] : ["保密中", "已发布", "已到期", "已撤回"]).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <Link to={isHomework ? "/my-lessons?tab=homework" : "/my-resources/exam-papers"} className="btn-gold flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" />{isHomework ? "布置作业" : "查看试卷库"}</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-ink-50 text-ink-700">
                {isHomework ? (
                  <tr>{["名称", "使用对象", "已交", "未交", "作业时间", "发布时间", "状态", "操作"].map((title) => <th key={title} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{title}</th>)}</tr>
                ) : (
                  <tr>{["考试名称", "使用对象", "类型", "发布时间", "解锁时间", "状态", "操作"].map((title) => <th key={title} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{title}</th>)}</tr>
                )}
              </thead>
              <tbody className="divide-y divide-ink-100">
                {isHomework ? filteredHomeworks.map((item) => {
                  const status = homeworkStatus(item, now);
                  const counts = homeworkSubmissionCounts(item, attendance);
                  return (
                    <tr key={item.id} className="align-top hover:bg-mist/40">
                      <td className="max-w-72 px-4 py-3"><div className="max-w-72 break-words font-medium text-ink-900" title={item.content}>{homeworkTitle(item)}</div>{item.attachments && item.attachments.length > 0 && <span className="text-xs text-ink-400">{item.attachments.length} 个附件</span>}</td>
                      <td className="max-w-56 px-4 py-3 text-ink-600">{item.classIds.map((id) => classNames.get(id) || id).join("、") || "—"}</td>
                      <td className="px-4 py-3 text-ink-700">{counts?.submitted ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-700">{counts?.missing ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{homeworkDateLabel(item)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTime(item.publishAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><Badge variant={statusVariant(status)}>{status}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3"><Link className="text-teal-700 hover:underline" to={`/my-lessons?tab=homework&edit=${encodeURIComponent(item.id)}`}>编辑</Link></td>
                    </tr>
                  );
                }) : filteredPublications.map((item) => {
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
              </tbody>
            </table>
          </div>
          {(isHomework ? filteredHomeworks.length : filteredPublications.length) === 0 && (
            <p className="px-4 py-12 text-center text-sm text-ink-500">{query || statusFilter !== "all" ? "没有符合筛选条件的记录" : isHomework ? "暂无已布置的作业" : "暂无已发布的考试"}</p>
          )}
          {isHomework && <p className="border-t border-ink-100 px-4 py-3 text-xs text-ink-400">已交/未交来自班级当日作业点名（未交不含请假学生），不区分同日不同作业；未点名或跨日期作业显示“—”。</p>}
        </Card>
      )}
    </div>
  );
}

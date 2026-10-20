import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronUp, ClipboardCheck, ImagePlus, Star, Trash2, Users } from "lucide-react";
import type {
  AnyClass,
  ClassroomHomework,
  HomeworkClassOverviewRecord,
  Student,
  HomeworkImageCategory,
  HomeworkOverviewImage,
} from "@/types";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/services/api";
import { HomeworkImageGallery } from "@/components/homework/HomeworkImageGallery";
import { HOMEWORK_IMAGE_CATEGORIES, imageCategory } from "@/components/homework/homeworkImageCategories";
import type { ChangeEvent } from "react";

function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function attendanceCounts(record: HomeworkClassOverviewRecord) {
  const submitted = new Set(record.submittedStudentIds || []);
  const absent = new Set(record.absentStudentIds || []);
  const missing = (record.studentIds || []).filter((id) => !submitted.has(id) && !absent.has(id)).length;
  return {
    submitted: submitted.size,
    absent: absent.size,
    missing,
  };
}

export function ClassHomeworkOverview({
  classInfo,
  students,
  teacherId,
  followedStudentIds,
}: {
  classInfo: AnyClass;
  students: Student[];
  teacherId: string;
  followedStudentIds: ReadonlySet<string>;
}) {
  const [homeworkDate, setHomeworkDate] = useState(localToday);
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [record, setRecord] = useState<HomeworkClassOverviewRecord | null>(null);
  const [history, setHistory] = useState<HomeworkClassOverviewRecord[]>([]);
  const [summary, setSummary] = useState("");
  const [savedSummary, setSavedSummary] = useState("");
  const [submittedStudentIds, setSubmittedStudentIds] = useState<Set<string>>(() => new Set());
  const [absentStudentIds, setAbsentStudentIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [summaryPending, setSummaryPending] = useState(false);
  const [attendancePending, setAttendancePending] = useState(false);
  const [images, setImages] = useState<HomeworkOverviewImage[]>([]);
  const savedImagesRef = useRef<HomeworkOverviewImage[]>([]);
  const [activeImageCategory, setActiveImageCategory] = useState<HomeworkImageCategory>("excellent");
  const activeImageCategoryRef = useRef<HomeworkImageCategory>("excellent");
  const [imagesPending, setImagesPending] = useState(false);
  const attendanceDraft = useRef({ submitted: new Set<string>(), absent: new Set<string>() });
  const pendingAttendance = useRef<{
    classId: string; date: string; submitted: string[]; absent: string[]; version: number;
  } | null>(null);
  const savingAttendance = useRef(false);
  const attendanceVersion = useRef(0);
  const currentKey = `${classInfo.id}:${homeworkDate}`;
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  const loadVersion = useRef(0);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "studentNo">("name");
  const sortedStudents = useMemo(() => {
    const collator = new Intl.Collator("zh-CN", { numeric: true });
    return [...students].sort((a, b) => {
      if (sortBy === "studentNo") {
        if (!a.studentNo && b.studentNo) return 1;
        if (a.studentNo && !b.studentNo) return -1;
        const byNumber = collator.compare(a.studentNo || "", b.studentNo || "");
        if (byNumber) return byNumber;
      }
      return collator.compare(a.name, b.name) || collator.compare(a.studentNo || "", b.studentNo || "") || a.id.localeCompare(b.id);
    });
  }, [sortBy, students]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const [current, records, assigned] = await Promise.all([
        homeworkRecordService.getClassOverview(classInfo.id, homeworkDate),
        homeworkRecordService.listClassOverviews(classInfo.id),
        classroomHomeworkService.listHomeworks({
          teacherId,
          classId: classInfo.id,
          assignedDate: homeworkDate,
        }),
      ]);
      if (version !== loadVersion.current) return;
      setRecord(current);
      setHistory(records);
      setSummary(current?.summary || "");
      setSavedSummary(current?.summary || "");
      const submitted = new Set<string>(current?.submittedStudentIds || []);
      const absent = new Set<string>(current?.absentStudentIds || []);
      attendanceDraft.current = { submitted, absent };
      setSubmittedStudentIds(submitted);
      setAbsentStudentIds(absent);
      savedImagesRef.current = current?.images || [];
      setImages(savedImagesRef.current);
      setImagesPending(false);
      setAttendancePending(false);
      setHomeworks(assigned);
    } catch (error) {
      if (version === loadVersion.current) toast.error("加载班级作业总览失败", error instanceof Error ? error.message : undefined);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [classInfo.id, homeworkDate, teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSummary = async () => {
    if (summaryPending) return;
    setSummaryPending(true);
    try {
      const saved = await homeworkRecordService.saveClassOverview({
        classId: classInfo.id,
        homeworkDate,
        summary,
      });
      setRecord(saved);
      setSummary(saved.summary);
      setSavedSummary(saved.summary);
      setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]
        .sort((a, b) => b.homeworkDate.localeCompare(a.homeworkDate)));
      toast.success(saved.summary ? "作业概况已保存" : "作业概况已清除");
    } catch (error) {
      toast.error("保存作业概况失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSummaryPending(false);
    }
  };

  const flushAttendance = async () => {
    if (savingAttendance.current) return;
    savingAttendance.current = true;
    while (pendingAttendance.current) {
      const pending = pendingAttendance.current;
      pendingAttendance.current = null;
      try {
        const saved = await homeworkRecordService.saveClassOverview({
          classId: pending.classId,
          homeworkDate: pending.date,
          submittedStudentIds: pending.submitted,
          absentStudentIds: pending.absent,
          attendanceTaken: true,
        });
        if (currentKeyRef.current === `${pending.classId}:${pending.date}`) {
          setRecord((record) => record ? {
            ...record,
            submittedStudentIds: saved.submittedStudentIds,
            absentStudentIds: saved.absentStudentIds,
            studentIds: saved.studentIds,
            studentNames: saved.studentNames,
            attendanceTaken: true,
            updatedAt: saved.updatedAt,
          } : saved);
          setHistory((records) => {
            const current = records.find((item) => item.id === saved.id);
            return [{ ...saved, summary: current?.summary ?? saved.summary, images: current?.images ?? saved.images },
              ...records.filter((item) => item.id !== saved.id)]
              .sort((a, b) => b.homeworkDate.localeCompare(a.homeworkDate));
          });
        }
      } catch (error) {
        toast.error("自动保存作业点名失败，请重试", error instanceof Error ? error.message : undefined);
      }
      if (attendanceVersion.current === pending.version
        && currentKeyRef.current === `${pending.classId}:${pending.date}`) {
        setAttendancePending(false);
      }
    }
    savingAttendance.current = false;
  };

  const toggleAttendance = (studentId: string, field: "submitted" | "absent") => {
    const submitted = new Set(attendanceDraft.current.submitted);
    const absent = new Set(attendanceDraft.current.absent);
    const target = field === "submitted" ? submitted : absent;
    const other = field === "submitted" ? absent : submitted;
    if (target.has(studentId)) target.delete(studentId);
    else {
      target.add(studentId);
      other.delete(studentId);
    }
    attendanceDraft.current = { submitted, absent };
    setSubmittedStudentIds(submitted);
    setAbsentStudentIds(absent);
    setAttendancePending(true);
    pendingAttendance.current = {
      classId: classInfo.id,
      date: homeworkDate,
      submitted: [...submitted],
      absent: [...absent],
      version: ++attendanceVersion.current,
    };
    void flushAttendance();
  };

  const saveImages = async (next: HomeworkOverviewImage[]) => {
    setImagesPending(true);
    const key = currentKey;
    try {
      const saved = await homeworkRecordService.saveClassOverview({
        classId: classInfo.id, homeworkDate, images: next,
      });
      if (currentKeyRef.current === key) {
        savedImagesRef.current = saved.images || [];
        setImages(savedImagesRef.current);
        setRecord((record) => record ? { ...record, images: saved.images, updatedAt: saved.updatedAt } : saved);
        setHistory((records) => {
          const current = records.find((item) => item.id === saved.id);
          return [{ ...saved, ...current, images: saved.images }, ...records.filter((item) => item.id !== saved.id)]
            .sort((a, b) => b.homeworkDate.localeCompare(a.homeworkDate));
        });
      }
    } catch (error) {
      if (currentKeyRef.current === key) setImages(savedImagesRef.current);
      toast.error("保存作业图片失败", error instanceof Error ? error.message : undefined);
    } finally {
      if (currentKeyRef.current === key) setImagesPending(false);
    }
  };

  const addImages = async (files: File[], category: HomeworkImageCategory) => {
    const valid = files.filter((file) => file.type.startsWith("image/"));
    if (valid.length !== files.length) {
      toast.error("只能上传图片文件");
      return;
    }
    if (images.length + valid.length > 6) {
      toast.error("作业图片最多 6 张");
      return;
    }
    if (!valid.length || imagesPending) return;
    const key = currentKey;
    setImagesPending(true);
    try {
      const uploaded = await Promise.all(valid.map(uploadFile));
      if (currentKeyRef.current !== key) return;
      const next = [...images, ...uploaded.map((file) => ({
        id: file.id, name: file.originalName, url: file.url, mimeType: file.mimeType, size: file.size,
        category, note: "",
      }))];
      setImages(next);
      await saveImages(next);
    } catch (error) {
      toast.error("上传作业图片失败", error instanceof Error ? error.message : undefined);
      setImagesPending(false);
    }
  };

  // 用户无需先聚焦粘贴框；选中分类后直接在页面按 Ctrl/Cmd+V 即可。
  useEffect(() => {
    const onPaste = (event: globalThis.ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return;
      const files = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (!files.length) return;
      event.preventDefault();
      void addImages(files, activeImageCategoryRef.current);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const selectImageCategory = (category: HomeworkImageCategory) => {
    activeImageCategoryRef.current = category;
    setActiveImageCategory(category);
  };

  const onChooseImages = (event: ChangeEvent<HTMLInputElement>, category: HomeworkImageCategory) => {
    void addImages(Array.from(event.target.files || []), category);
    event.target.value = "";
  };

  const currentMissingCount = useMemo(() => students.filter((student) => (
    !submittedStudentIds.has(student.id) && !absentStudentIds.has(student.id)
  )).length, [absentStudentIds, students, submittedStudentIds]);

  const orderedStudents = useMemo(() => [
    ...sortedStudents.filter((student) => !submittedStudentIds.has(student.id)),
    ...sortedStudents.filter((student) => submittedStudentIds.has(student.id)),
  ], [sortedStudents, submittedStudentIds]);

  const previousRecords = useMemo(
    () => history.filter((item) => item.homeworkDate !== homeworkDate),
    [history, homeworkDate],
  );
  const visibleHistory = historyExpanded ? previousRecords : previousRecords.slice(0, 3);
  const missingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const today = localToday();
    for (const item of history) {
      if (!item.attendanceTaken || item.homeworkDate > today) continue;
      const excluded = new Set([...item.submittedStudentIds, ...item.absentStudentIds]);
      for (const id of item.studentIds) {
        if (!excluded.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return counts;
  }, [history]);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={24} /></div>;
  }

  return (
    <div>
      <section className="border-b border-gold-200 bg-gold-50/40 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">{classInfo.name} · 作业情况总览</h3>
            <p className="mt-0.5 text-xs text-ink-500">查看当天作业、记录班级概况并完成作业点名</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
            <CalendarDays className="h-4 w-4 text-gold-600" />
            <span>作业日期</span>
            <input
              type="date"
              aria-label="班级作业日期"
              value={homeworkDate}
              onChange={(event) => event.target.value && setHomeworkDate(event.target.value)}
              className="rounded-lg border border-ink-200 bg-paper px-2.5 py-1.5 text-xs text-ink-700 outline-none transition-colors focus:border-gold-400"
            />
          </label>
        </div>
      </section>

      <section className="border-b border-ink-100 p-4 lg:p-5">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-gold-600" />
          <h3 className="text-sm font-semibold text-ink-900">当天作业内容</h3>
        </div>
        {homeworks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 bg-mist/30 px-4 py-5 text-center text-xs text-ink-400">
            当天没有布置班级作业
          </div>
        ) : (
          <div className="space-y-2">
            {homeworks.map((homework) => (
              <div key={homework.id} className="rounded-lg border border-ink-100 bg-paper px-3 py-2.5">
                <div className="flex items-center gap-2 text-[11px] text-ink-400">
                  <span className="font-medium text-ink-600">{homework.subject}</span>
                  <span>·</span>
                  <span>{homework.teacherName}</span>
                </div>
                {homework.content && (
                  <div className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{homework.content}</div>
                )}
                {(homework.attachments?.length || 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {homework.attachments?.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-ink-200 bg-mist/40 px-2 py-1 text-[11px] text-ink-600 hover:border-gold-300"
                      >
                        {attachment.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-b border-ink-100 p-4 lg:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            label="当天作业概况"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="记录全班完成情况、共性问题、需要讲评的内容等..."
            rows={3}
            disabled={summaryPending}
            className="min-h-[88px] bg-paper"
          />
          <Button
            variant="gold"
            size="sm"
            className="sm:mb-[2px] sm:shrink-0"
            onClick={() => void saveSummary()}
            loading={summaryPending}
            disabled={summaryPending || summary.trim() === savedSummary.trim()}
          >
            保存概况
          </Button>
        </div>
      </section>

      <section className="border-b border-ink-100">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gold-600" />
              <h3 className="text-sm font-semibold text-ink-900">作业点名</h3>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              勾选表示已交作业；未勾选且未请假会记为未交，并同步到“师生互动”时间线
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1" role="group" aria-label="作业点名排序">
              {(["name", "studentNo"] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={sortBy === mode}
                  onClick={() => setSortBy(mode)}
                  className={cn("rounded-md border px-2 py-1 transition-colors",
                    sortBy === mode ? "border-gold-500 bg-gold-50 font-medium text-gold-800" : "border-ink-200 bg-paper text-ink-500 hover:border-gold-300")}
                >
                  {mode === "name" ? "按姓名排序" : "按学号排序"}
                </button>
              ))}
            </div>
            <span className="text-emerald-700">已交 {submittedStudentIds.size}</span>
            <span className="text-red-600">未交 {currentMissingCount}</span>
            <span className="text-amber-700">请假 {absentStudentIds.size}</span>
          </div>
        </div>
        {students.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-400">该班级暂无学生</div>
        ) : (
          <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3 lg:px-5 lg:pb-5">
            {orderedStudents.map((student) => {
              const submitted = submittedStudentIds.has(student.id);
              const absent = absentStudentIds.has(student.id);
              return (
                <div
                  key={student.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5",
                    absent ? "border-amber-200 bg-amber-50/60"
                      : submitted ? "border-emerald-200 bg-emerald-50/50"
                        : "border-red-100 bg-red-50/30",
                  )}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <span className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      submitted ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-300 bg-paper",
                    )}>
                      {submitted && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={submitted}
                      onChange={() => toggleAttendance(student.id, "submitted")}
                      aria-label={`${student.name}已交作业`}
                    />
                    <span className="truncate text-sm font-medium text-ink-800">{student.name}</span>
                    {followedStudentIds.has(student.id) && (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-red-600 text-red-600" role="img" aria-label={`${student.name}已关注`} />
                    )}
                    <span className="shrink-0 text-[11px] text-ink-500" title={`截至今天未交作业 ${missingCounts.get(student.id) || 0} 次`}>
                      （{missingCounts.get(student.id) || 0}次）
                    </span>
                    {student.studentNo && <span className="shrink-0 text-[10px] text-ink-400">{student.studentNo}</span>}
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-amber-700">
                    <input
                      type="checkbox"
                      checked={absent}
                      onChange={() => toggleAttendance(student.id, "absent")}
                      aria-label={`${student.name}请假`}
                      className="rounded border-ink-300 text-amber-600 focus:ring-amber-400"
                    />
                    请假
                  </label>
                </div>
              );
            })}
          </div>
        )}
        <div className="border-t border-ink-100 px-4 py-3 text-[11px] text-ink-500 lg:px-5" role="status">
          {attendancePending ? "作业点名正在自动保存..."
            : record?.attendanceTaken ? "作业点名已自动保存，修改后将再次自动保存" : "勾选后自动保存作业点名"}
        </div>
      </section>

      <section className="border-b border-ink-100 p-4 lg:p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-900">
          <ImagePlus className="h-4 w-4 text-gold-600" />作业图片
        </h3>
        <p className="mb-3 text-xs text-ink-500">选择分类后可直接按 Ctrl/Cmd+V 粘贴截图；最多 6 张，支持逐张备注。</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {HOMEWORK_IMAGE_CATEGORIES.map((category) => {
            const group = images.filter((image) => imageCategory(image) === category.id);
            return <div key={category.id} className="rounded-lg border border-ink-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-ink-800">{category.label}（{group.length}）</h4>
                <label className="cursor-pointer rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs hover:border-gold-400">
                  上传图片
                  <input type="file" accept="image/*" multiple className="sr-only"
                    aria-label={`上传${category.label}图片`} disabled={imagesPending}
                    onChange={(event) => onChooseImages(event, category.id)} />
                </label>
              </div>
              <div role="textbox" aria-label={`粘贴${category.label}图片`} tabIndex={0}
                onFocus={() => selectImageCategory(category.id)}
                onClick={() => selectImageCategory(category.id)}
                className={cn("cursor-pointer rounded-lg border border-dashed px-3 py-3 text-xs focus:outline-none",
                  activeImageCategory === category.id ? "border-gold-400 bg-gold-50/40 text-ink-700" : "border-ink-200 text-ink-500")}
              >
                {activeImageCategory === category.id ? "当前粘贴分类" : "点击选择粘贴分类"} · Ctrl/Cmd+V 粘贴图片
                {imagesPending && " · 正在保存..."}
              </div>
              {group.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.map((image) => <div key={image.id} className="min-w-0 rounded-lg border border-ink-100 bg-paper p-2">
                  <div className="relative">
                    <a href={image.url} target="_blank" rel="noreferrer" title="点击查看大图">
                      <img src={image.url} alt={image.name} className="h-28 w-full rounded object-contain" />
                    </a>
                    <button type="button" aria-label={`删除作业图片${image.name}`} disabled={imagesPending}
                      onClick={() => void saveImages(images.filter((item) => item.id !== image.id))}
                      className="absolute right-1 top-1 rounded-full bg-ink-800 p-1 text-white disabled:opacity-40">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <button type="button" disabled={imagesPending}
                    aria-label={`将${image.name}移至${category.id === "excellent" ? "糟糕作业" : "优秀作业"}`}
                    onClick={() => void saveImages(images.map((item) => item.id === image.id
                      ? { ...item, category: category.id === "excellent" ? "poor" : "excellent" } : item))}
                    className="mt-1 text-xs text-gold-700 hover:text-gold-800 disabled:opacity-40">
                    移至{category.id === "excellent" ? "糟糕作业" : "优秀作业"}
                  </button>
                  <textarea aria-label={`${image.name}备注`} placeholder="添加备注说明"
                    value={image.note || ""} maxLength={500} rows={2} disabled={imagesPending}
                    onChange={(event) => setImages((current) => current.map((item) => item.id === image.id
                      ? { ...item, note: event.target.value } : item))}
                    className="mt-2 w-full resize-y rounded border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-700 focus:border-gold-400 focus:outline-none" />
                  <button type="button" disabled={imagesPending || (image.note || "").trim() === (savedImagesRef.current.find((item) => item.id === image.id)?.note || "")}
                    onClick={() => void saveImages(images)}
                    className="mt-1 text-xs text-gold-700 hover:text-gold-800 disabled:opacity-40">
                    保存备注
                  </button>
                </div>)}
              </div>}
            </div>;
          })}
        </div>
      </section>

      <section className="p-4 lg:p-5">
        <h3 className="text-sm font-semibold text-ink-900">以前的作业概况</h3>
        <p className="mt-0.5 text-xs text-ink-500">默认显示最近 3 次，其余记录可展开查看</p>
        {visibleHistory.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-400">暂无以前的作业概况</div>
        ) : (
          <div className="mt-3 space-y-2">
            {visibleHistory.map((item) => {
              const counts = attendanceCounts(item);
              return (
                <div key={item.id} className="rounded-lg border border-ink-100 bg-mist/30 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-700">{item.homeworkDate}</span>
                    {item.attendanceTaken && (
                      <span className="text-[11px] text-ink-400">
                        已交 {counts.submitted} · 未交 {counts.missing} · 请假 {counts.absent}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 whitespace-pre-wrap text-sm text-ink-600">
                    {item.summary || "未填写作业概况"}
                  </div>
                  {item.attendanceTaken && <div className="mt-2 text-xs text-ink-600">
                    未交名单：{item.studentIds.filter((id) => !item.submittedStudentIds.includes(id) && !item.absentStudentIds.includes(id))
                      .map((id) => `${item.studentNames?.[id] || students.find((student) => student.id === id)?.name || id}（${missingCounts.get(id) || 1}次）`).join("、") || "无"}
                  </div>}
                  <HomeworkImageGallery images={item.images || []} />
                </div>
              );
            })}
          </div>
        )}
        {previousRecords.length > 3 && (
          <button
            type="button"
            onClick={() => setHistoryExpanded((current) => !current)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:text-gold-800"
          >
            {historyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {historyExpanded ? "收起其余记录" : `展开其余 ${previousRecords.length - 3} 次`}
          </button>
        )}
      </section>
    </div>
  );
}

export default ClassHomeworkOverview;

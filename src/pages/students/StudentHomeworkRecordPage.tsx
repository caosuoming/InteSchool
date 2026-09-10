import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  CalendarDays,
  ListChecks,
  Pin,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { classService } from "@/services/class";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { studentInteractionService } from "@/services/studentInteraction";
import { knowledgeService } from "@/services/knowledge";
import { HOMEWORK_ATTITUDE_KEYWORDS } from "@/types";
import type {
  AnyClass,
  HomeworkAttitudeKeyword,
  HomeworkKnowledgeStatus,
  KnowledgePoint,
  Student,
  TreeNode,
} from "@/types";
import { ResizableSplitPane } from "@/components/layout/ResizableSplitPane";
import { StudentRosterSidebar } from "./StudentRosterSidebar";
import { buildStudentRosterGroups } from "./student-roster";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { cn } from "@/lib/utils";

const statusOptions: Array<{
  value: HomeworkKnowledgeStatus;
  label: string;
  icon: typeof Check;
  selectedClassName: string;
}> = [
  {
    value: "done",
    label: "已做",
    icon: Check,
    selectedClassName: "border-sky-500 bg-sky-100 text-sky-900 ring-2 ring-sky-200 shadow-sm",
  },
  {
    value: "correct",
    label: "全对",
    icon: CheckCircle2,
    selectedClassName: "border-emerald-500 bg-emerald-100 text-emerald-900 ring-2 ring-emerald-200 shadow-sm",
  },
  {
    value: "partial",
    label: "半对",
    icon: CircleDot,
    selectedClassName: "border-amber-500 bg-amber-100 text-amber-900 ring-2 ring-amber-200 shadow-sm",
  },
  {
    value: "wrong",
    label: "做错",
    icon: XCircle,
    selectedClassName: "border-red-500 bg-red-100 text-red-900 ring-2 ring-red-200 shadow-sm",
  },
];

export function StudentHomeworkRecordPage() {
  const { teacher } = useAuthStore();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [pinnedKnowledgePointIds, setPinnedKnowledgePointIds] = useState<string[]>([]);
  const [draftPinnedIds, setDraftPinnedIds] = useState<string[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [keyword, setKeyword] = useState("");
  const [followedStudentIds, setFollowedStudentIds] = useState<Set<string>>(() => new Set());
  const [followPendingStudentIds, setFollowPendingStudentIds] = useState<Set<string>>(() => new Set());
  const [lastInteractionMap, setLastInteractionMap] = useState<Record<string, string>>({});
  const [homeworkDate, setHomeworkDate] = useState(() => {
    const today = new Date();
    const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  });
  const [attitudeKeywords, setAttitudeKeywords] = useState<HomeworkAttitudeKeyword[]>([]);
  const [attitudePending, setAttitudePending] = useState(false);
  const [statusByKnowledgePointId, setStatusByKnowledgePointId] = useState<Record<string, HomeworkKnowledgeStatus>>({});
  const [pendingKnowledgePointIds, setPendingKnowledgePointIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [recordLoading, setRecordLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingPins, setSavingPins] = useState(false);

  const loadPage = useCallback(async () => {
    if (!teacher?.id || !teacher.schoolId) return;
    setLoading(true);
    try {
      const [studentList, classList, tree, points, pinnedIds, followedIds, teacherInteractions] = await Promise.all([
        classService.listMyStudents(teacher.schoolId, teacher.id),
        classService.listMyClasses(teacher.schoolId, teacher.id),
        knowledgeService.getKnowledgeTree(teacher.schoolId),
        knowledgeService.listKnowledgePoints(teacher.schoolId),
        homeworkRecordService.listPinnedKnowledgePointIds(),
        studentInteractionService.listFollowedStudentIds(),
        studentInteractionService.listByTeacher(teacher.id),
      ]);
      const nextLastInteractionMap: Record<string, string> = {};
      teacherInteractions.forEach((interaction) => {
        const existing = nextLastInteractionMap[interaction.studentId];
        if (!existing || new Date(interaction.createdAt) > new Date(existing)) {
          nextLastInteractionMap[interaction.studentId] = interaction.createdAt;
        }
      });
      setStudents(studentList);
      setClasses(classList);
      setKnowledgeTree(tree);
      setKnowledgePoints(points);
      setPinnedKnowledgePointIds(pinnedIds);
      setDraftPinnedIds(pinnedIds);
      setFollowedStudentIds(new Set(followedIds));
      setLastInteractionMap(nextLastInteractionMap);
      setSelectedStudentId((current) => (
        current && studentList.some((student) => student.id === current)
          ? current
          : studentList[0]?.id ?? null
      ));
    } catch (error) {
      toast.error("加载作业记录失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [teacher?.id, teacher?.schoolId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!selectedStudentId) {
      setAttitudeKeywords([]);
      setStatusByKnowledgePointId({});
      return;
    }
    let cancelled = false;
    setRecordLoading(true);
    Promise.all([
      homeworkRecordService.listByStudent(selectedStudentId),
      homeworkRecordService.getAttitudeByStudent(selectedStudentId, homeworkDate),
    ])
      .then(([records, attitude]) => {
        if (cancelled) return;
        setAttitudeKeywords(attitude?.keywords ?? []);
        setStatusByKnowledgePointId(Object.fromEntries(
          records.map((record) => [record.knowledgePointId, record.status]),
        ));
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error("加载学生作业记录失败", error instanceof Error ? error.message : undefined);
        }
      })
      .finally(() => {
        if (!cancelled) setRecordLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [homeworkDate, selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return students;
    return students.filter((student) =>
      student.name.toLowerCase().includes(normalized)
      || (student.studentNo || "").toLowerCase().includes(normalized));
  }, [keyword, students]);

  const studentGroups = useMemo(() => buildStudentRosterGroups(
    filteredStudents,
    classes,
    followedStudentIds,
    lastInteractionMap,
  ), [classes, filteredStudents, followedStudentIds, lastInteractionMap]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const knowledgePointMap = useMemo(
    () => new Map(knowledgePoints.map((point) => [point.id, point] as const)),
    [knowledgePoints],
  );
  const pinnedKnowledgePoints = useMemo(
    () => pinnedKnowledgePointIds
      .map((id) => knowledgePointMap.get(id))
      .filter((point): point is KnowledgePoint => Boolean(point)),
    [knowledgePointMap, pinnedKnowledgePointIds],
  );

  const knowledgePointPath = useCallback((knowledgePointId: string) => {
    const path: string[] = [];
    const visited = new Set<string>();
    let current = knowledgePointMap.get(knowledgePointId);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current.name);
      current = current.parentId ? knowledgePointMap.get(current.parentId) : undefined;
    }
    return path.join(" / ");
  }, [knowledgePointMap]);

  const setKnowledgeStatus = async (
    knowledgePointId: string,
    status: HomeworkKnowledgeStatus | null,
  ) => {
    if (!selectedStudentId || pendingKnowledgePointIds.has(knowledgePointId)) return;
    const previous = statusByKnowledgePointId[knowledgePointId];
    setStatusByKnowledgePointId((current) => {
      const next = { ...current };
      if (status === null) delete next[knowledgePointId];
      else next[knowledgePointId] = status;
      return next;
    });
    setPendingKnowledgePointIds((current) => new Set(current).add(knowledgePointId));
    try {
      await homeworkRecordService.setRecord({
        studentId: selectedStudentId,
        knowledgePointId,
        status,
      });
    } catch (error) {
      setStatusByKnowledgePointId((current) => {
        const next = { ...current };
        if (previous === undefined) delete next[knowledgePointId];
        else next[knowledgePointId] = previous;
        return next;
      });
      toast.error("保存作业记录失败", error instanceof Error ? error.message : undefined);
    } finally {
      setPendingKnowledgePointIds((current) => {
        const next = new Set(current);
        next.delete(knowledgePointId);
        return next;
      });
    }
  };

  const toggleAttitudeKeyword = async (attitudeKeyword: HomeworkAttitudeKeyword) => {
    if (!selectedStudentId || attitudePending) return;
    const previous = attitudeKeywords;
    const next = previous.includes(attitudeKeyword)
      ? previous.filter((item) => item !== attitudeKeyword)
      : [...previous, attitudeKeyword];
    setAttitudeKeywords(next);
    setAttitudePending(true);
    try {
      await homeworkRecordService.setAttitudeKeywords({
        studentId: selectedStudentId,
        homeworkDate,
        keywords: next,
      });
    } catch (error) {
      setAttitudeKeywords(previous);
      toast.error("保存作业态度失败", error instanceof Error ? error.message : undefined);
    } finally {
      setAttitudePending(false);
    }
  };

  const toggleFollow = async (studentId: string) => {
    if (followPendingStudentIds.has(studentId)) return;
    const nextFollowed = !followedStudentIds.has(studentId);
    setFollowPendingStudentIds((current) => new Set(current).add(studentId));
    setFollowedStudentIds((current) => {
      const next = new Set(current);
      if (nextFollowed) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
    try {
      await studentInteractionService.setStudentFollowed(studentId, nextFollowed);
    } catch (error) {
      setFollowedStudentIds((current) => {
        const next = new Set(current);
        if (nextFollowed) next.delete(studentId);
        else next.add(studentId);
        return next;
      });
      toast.error("更新关注状态失败", error instanceof Error ? error.message : undefined);
    } finally {
      setFollowPendingStudentIds((current) => {
        const next = new Set(current);
        next.delete(studentId);
        return next;
      });
    }
  };

  const openPicker = () => {
    setDraftPinnedIds(pinnedKnowledgePointIds);
    setPickerOpen(true);
  };

  const savePinnedKnowledgePoints = async () => {
    const validIds = new Set(knowledgePoints.map((point) => point.id));
    const sanitized = draftPinnedIds.filter((id) => validIds.has(id));
    setSavingPins(true);
    try {
      const saved = await homeworkRecordService.setPinnedKnowledgePointIds(sanitized);
      setPinnedKnowledgePointIds(saved);
      setDraftPinnedIds(saved);
      setPickerOpen(false);
      toast.success("固定知识点已更新");
    } catch (error) {
      toast.error("固定知识点失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingPins(false);
    }
  };

  return (
    <div>
      <ResizableSplitPane
        storageKey="inteschool:my-students-sidebar-width"
        className="h-[calc(100vh-12rem)] lg:h-auto lg:items-start"
        sidebarClassName="h-full lg:h-auto"
        contentClassName="h-full lg:sticky lg:top-6 lg:h-[calc(100vh-1.5rem)] lg:self-start"
        sidebar={
          <StudentRosterSidebar
            groups={studentGroups}
            loading={loading}
            keyword={keyword}
            selectedStudentId={selectedStudentId}
            expandedGroupIds={expandedGroupIds}
            followedStudentIds={followedStudentIds}
            followPendingStudentIds={followPendingStudentIds}
            lastInteractionMap={lastInteractionMap}
            onKeywordChange={setKeyword}
            onToggleGroup={toggleGroup}
            onSelectStudent={setSelectedStudentId}
            onToggleFollow={(studentId) => void toggleFollow(studentId)}
          />
        }
      >
        <div className="h-full flex flex-col gap-4">
          <Card className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-gold-600" />
                <h2 className="font-serif text-lg font-semibold text-ink-900">作业记录</h2>
              </div>
              <div className="mt-1 text-xs text-ink-500">
                {selectedStudent
                  ? `当前学生：${selectedStudent.name} · 固定 ${pinnedKnowledgePoints.length} 个知识点`
                  : "选择左侧学生后记录各知识点的作业情况"}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={openPicker} disabled={!knowledgeTree || loading}>
              <Pin className="w-3.5 h-3.5" />
              固定知识点
            </Button>
          </Card>

          <Card className="flex-1 min-h-0 overflow-auto">
            {!selectedStudent ? (
              <EmptyState
                icon={<ListChecks className="w-10 h-10 text-ink-200" />}
                title="请选择学生"
                description="从左侧选择学生后即可记录作业态度与知识点掌握情况"
              />
            ) : recordLoading ? (
              <div className="flex justify-center py-20"><Spinner size={24} /></div>
            ) : (
              <div>
                <section className="border-b border-gold-200 bg-gold-50/40 p-4 lg:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ClipboardCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-600" />
                      <div>
                        <h3 className="text-sm font-semibold text-ink-900">作业态度</h3>
                        <p className="mt-0.5 text-xs text-ink-500">可多选候选关键词，已选 {attitudeKeywords.length} 项</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
                      <CalendarDays className="h-4 w-4 text-gold-600" />
                      <span>作业日期</span>
                      <input
                        type="date"
                        aria-label="作业日期"
                        value={homeworkDate}
                        disabled={attitudePending}
                        onChange={(event) => {
                          if (event.target.value) setHomeworkDate(event.target.value);
                        }}
                        className="rounded-lg border border-ink-200 bg-paper px-2.5 py-1.5 text-xs text-ink-700 outline-none transition-colors focus:border-gold-400 disabled:opacity-60"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="作业态度关键词">
                    {HOMEWORK_ATTITUDE_KEYWORDS.map((attitudeKeyword) => {
                      const selected = attitudeKeywords.includes(attitudeKeyword);
                      return (
                        <button
                          key={attitudeKeyword}
                          type="button"
                          aria-pressed={selected}
                          disabled={attitudePending}
                          onClick={() => void toggleAttitudeKeyword(attitudeKeyword)}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all disabled:cursor-wait disabled:opacity-60",
                            selected
                              ? "border-gold-500 bg-gold-100 text-gold-900 ring-2 ring-gold-200 shadow-gold"
                              : "border-ink-200 bg-paper text-ink-600 hover:border-gold-300 hover:bg-gold-50",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "inline-flex h-4 w-4 items-center justify-center rounded-full border",
                              selected
                                ? "border-gold-600 bg-gold-600 text-white"
                                : "border-ink-300 bg-paper",
                            )}
                          >
                            {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                          </span>
                          {attitudeKeyword}
                          {selected && (
                            <span aria-hidden="true" className="rounded-full bg-paper/80 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-gold-700">已选</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="border-b border-ink-100 px-4 py-3 lg:px-5">
                    <h3 className="text-sm font-semibold text-ink-900">知识点掌握情况</h3>
                    <p className="mt-0.5 text-xs text-ink-500">每个知识点选择一个最符合本次作业的状态</p>
                  </div>
                  {pinnedKnowledgePoints.length === 0 ? (
                    <EmptyState
                      icon={<Pin className="w-10 h-10 text-ink-200" />}
                      title="还没有固定知识点"
                      description="从知识点目录勾选常用知识点，固定后即可逐个标记作业情况"
                      action={<Button variant="gold" size="sm" onClick={openPicker}>选择知识点</Button>}
                    />
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {pinnedKnowledgePoints.map((point) => {
                        const currentStatus = statusByKnowledgePointId[point.id];
                        const pending = pendingKnowledgePointIds.has(point.id);
                        const fullPath = knowledgePointPath(point.id);
                        return (
                          <div key={point.id} className="p-4 lg:p-5 flex flex-col xl:flex-row xl:items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-ink-900">{point.name}</div>
                              {fullPath && fullPath !== point.name && (
                                <div className="mt-1 text-xs text-ink-400 truncate" title={fullPath}>{fullPath}</div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${point.name}作业状态`}>
                              {statusOptions.map((option) => {
                                const Icon = option.icon;
                                const selected = currentStatus === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={selected}
                                    disabled={pending}
                                    onClick={() => void setKnowledgeStatus(point.id, option.value)}
                                    className={cn(
                                      "inline-flex min-w-[84px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all disabled:cursor-wait disabled:opacity-60",
                                      selected
                                        ? `${option.selectedClassName} font-semibold`
                                        : "border-ink-200 bg-paper text-ink-600 hover:border-ink-300 hover:bg-mist/60",
                                    )}
                                  >
                                    <Icon className="w-3.5 h-3.5" />
                                    {option.label}
                                    {selected && (
                                      <span aria-hidden="true" className="rounded-full bg-paper/80 px-1.5 py-0.5 text-[9px] font-semibold leading-none">已选</span>
                                    )}
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                disabled={pending || !currentStatus}
                                onClick={() => void setKnowledgeStatus(point.id, null)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs text-ink-400 transition-colors hover:bg-mist hover:text-ink-700 disabled:cursor-default disabled:opacity-30"
                                title="清除当前标记"
                                aria-label={`清除${point.name}作业状态`}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                清除
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </Card>
        </div>
      </ResizableSplitPane>

      <Modal
        open={pickerOpen}
        onClose={() => {
          if (!savingPins) setPickerOpen(false);
        }}
        title="固定知识点"
        description="从当前知识点目录勾选需要持续记录的知识点。固定设置会保存在教师账号中。"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPickerOpen(false)} disabled={savingPins}>取消</Button>
            <Button variant="gold" onClick={() => void savePinnedKnowledgePoints()} loading={savingPins}>保存固定</Button>
          </>
        }
      >
        {knowledgeTree ? (
          <SearchableTree
            data={knowledgeTree}
            title="知识点目录"
            accent="teal"
            checkable
            checkedIds={draftPinnedIds}
            onCheck={setDraftPinnedIds}
            searchPlaceholder="搜索知识点..."
            showResetButton
          />
        ) : (
          <div className="flex justify-center py-10"><Spinner size={20} /></div>
        )}
      </Modal>
    </div>
  );
}

export default StudentHomeworkRecordPage;

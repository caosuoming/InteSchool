import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  GraduationCap,
  ListChecks,
  Pin,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { classService } from "@/services/class";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { knowledgeService } from "@/services/knowledge";
import type {
  AnyClass,
  HomeworkKnowledgeRecord,
  HomeworkKnowledgeStatus,
  KnowledgePoint,
  Student,
  TreeNode,
} from "@/types";
import { ResizableSplitPane } from "@/components/layout/ResizableSplitPane";
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
    selectedClassName: "border-sky-300 bg-sky-50 text-sky-700",
  },
  {
    value: "correct",
    label: "全对",
    icon: CheckCircle2,
    selectedClassName: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  {
    value: "partial",
    label: "半对",
    icon: CircleDot,
    selectedClassName: "border-amber-300 bg-amber-50 text-amber-700",
  },
  {
    value: "wrong",
    label: "做错",
    icon: XCircle,
    selectedClassName: "border-red-300 bg-red-50 text-red-700",
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
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("");
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
      const [studentList, classList, tree, points] = await Promise.all([
        classService.listMyStudents(teacher.schoolId, teacher.id),
        classService.listMyClasses(teacher.schoolId, teacher.id),
        knowledgeService.getKnowledgeTree(teacher.schoolId),
        knowledgeService.listKnowledgePoints(teacher.schoolId),
      ]);
      const pinnedIds = await homeworkRecordService.listPinnedKnowledgePointIds();
      setStudents(studentList);
      setClasses(classList);
      setKnowledgeTree(tree);
      setKnowledgePoints(points);
      setPinnedKnowledgePointIds(pinnedIds);
      setDraftPinnedIds(pinnedIds);
      setExpandedGroupIds(new Set(classList.map((item) => item.id)));
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
      setStatusByKnowledgePointId({});
      return;
    }
    let cancelled = false;
    setRecordLoading(true);
    homeworkRecordService.listByStudent(selectedStudentId)
      .then((records: HomeworkKnowledgeRecord[]) => {
        if (cancelled) return;
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
  }, [selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return students;
    return students.filter((student) =>
      student.name.toLowerCase().includes(normalized)
      || (student.studentNo || "").toLowerCase().includes(normalized));
  }, [keyword, students]);

  const studentGroups = useMemo(() => {
    const groupedIds = new Set<string>();
    const groups = classes.flatMap((classInfo) => {
      const members = filteredStudents.filter((student) => {
        const included = classInfo.type === "school"
          ? student.classId === classInfo.id
          : classInfo.studentIds.includes(student.id);
        if (included) groupedIds.add(student.id);
        return included;
      });
      return members.length > 0
        ? [{ id: classInfo.id, name: classInfo.name, students: members }]
        : [];
    });
    const ungrouped = filteredStudents.filter((student) => !groupedIds.has(student.id));
    if (ungrouped.length > 0) groups.push({ id: "ungrouped", name: "其他学生", students: ungrouped });
    return groups;
  }, [classes, filteredStudents]);

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

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

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
        storageKey="inteschool:homework-record-sidebar-width"
        className="h-[calc(100vh-12rem)]"
        sidebarClassName="h-full"
        contentClassName="h-full"
        sidebar={
          <Card className="h-full flex flex-col">
            <div className="p-3 border-b border-ink-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索学生..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-ink-200 bg-paper text-sm focus:outline-none focus:border-gold-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex justify-center py-10"><Spinner size={20} /></div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-400">暂无学生</div>
              ) : (
                <div className="px-3 py-2 space-y-3">
                  {studentGroups.map((group) => {
                    const expanded = expandedGroupIds.has(group.id);
                    return (
                      <section key={group.id}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => toggleGroup(group.id)}
                          className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-semibold text-gold-700 tracking-wide transition-colors hover:bg-gold-400/10"
                        >
                          {expanded
                            ? <ChevronDown className="w-3 h-3 flex-shrink-0" />
                            : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                          <GraduationCap className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{group.name}</span>
                          <span className="text-ink-400 font-normal">（{group.students.length}）</span>
                        </button>
                        {expanded && (
                          <div className="mt-1 space-y-0.5">
                            {group.students.map((student) => (
                              <button
                                key={`${group.id}-${student.id}`}
                                type="button"
                                onClick={() => setSelectedStudentId(student.id)}
                                className={cn(
                                  "w-full rounded-md px-2 py-2 text-left transition-colors",
                                  selectedStudentId === student.id
                                    ? "bg-gold-400/10 text-gold-800"
                                    : "text-ink-700 hover:bg-mist",
                                )}
                              >
                                <div className="text-sm font-medium truncate">{student.name}</div>
                                {student.studentNo && (
                                  <div className="mt-0.5 text-[10px] text-ink-400 truncate">学号 {student.studentNo}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
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
                description="从左侧选择学生后即可记录作业完成与正确情况"
              />
            ) : pinnedKnowledgePoints.length === 0 ? (
              <EmptyState
                icon={<Pin className="w-10 h-10 text-ink-200" />}
                title="还没有固定知识点"
                description="从知识点目录勾选常用知识点，固定后即可逐个标记作业情况"
                action={<Button variant="gold" size="sm" onClick={openPicker}>选择知识点</Button>}
              />
            ) : recordLoading ? (
              <div className="flex justify-center py-20"><Spinner size={24} /></div>
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
                                "inline-flex min-w-[76px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60",
                                selected
                                  ? option.selectedClassName
                                  : "border-ink-200 bg-paper text-ink-600 hover:border-ink-300 hover:bg-mist/60",
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {option.label}
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

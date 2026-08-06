import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  ContactRound,
  GraduationCap,
  History,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ResizableSplitPane } from "@/components/layout/ResizableSplitPane";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  STUDENT_ARCHIVE_STATUS_META,
  getStudentArchiveStatus,
  getStudentStatusAfterLeave,
} from "@/lib/student-archive";
import {
  canManageStudentArchive,
  getHomeroomClassIds,
} from "@/lib/student-archive-permissions";
import { cn } from "@/lib/utils";
import { classService } from "@/services/class";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type {
  AnyClass,
  Student,
  StudentArchiveOverview,
  StudentArchiveRecord,
  StudentArchiveStatus,
  StudentArchiveStatusInput,
  StudentContactInfo,
} from "@/types";

const EMPTY_OVERVIEW: StudentArchiveOverview = { classes: [], students: [], records: [] };

const STATUS_OPTIONS: Array<{ value: Exclude<StudentArchiveStatus, "graduated">; label: string }> = [
  { value: "attending", label: "在籍 · 在读" },
  { value: "studyAway", label: "外出借读" },
  { value: "visiting", label: "到校借读" },
  { value: "leave", label: "请假" },
  { value: "suspended", label: "休学" },
  { value: "transferred", label: "转学" },
];

const EMPTY_CONTACTS: StudentContactInfo = {
  studentPhone: "",
  guardianName: "",
  guardianPhone: "",
  emergencyContact: "",
  emergencyPhone: "",
};

const EMPTY_STATUS_FORM: StudentArchiveStatusInput = {
  status: "attending",
  externalSchool: "",
  startDate: "",
  endDate: "",
  note: "",
};

function statusVariant(status: StudentArchiveStatus): "green" | "gold" | "teal" | "amber" | "red" | "ink" {
  if (status === "attending") return "green";
  if (status === "studyAway") return "gold";
  if (status === "visiting") return "teal";
  if (status === "leave") return "amber";
  if (status === "suspended") return "red";
  return "ink";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recordTitle(record: StudentArchiveRecord): string {
  if (record.type === "contact") return "更新联系方式";
  return record.status ? `状态调整为「${STUDENT_ARCHIVE_STATUS_META[record.status].label}」` : "更新学生状态";
}

function classStudentIds(classInfo: AnyClass, students: Student[]): Set<string> {
  if (classInfo.type === "personal") return new Set(classInfo.studentIds);
  return new Set(students.filter((student) => student.classId === classInfo.id).map((student) => student.id));
}

export function StudentArchivePage() {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const [overview, setOverview] = useState<StudentArchiveOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentArchiveStatus | "all">("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(new Set());
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState<StudentContactInfo & { note?: string }>({ ...EMPTY_CONTACTS, note: "" });
  const [statusForm, setStatusForm] = useState<StudentArchiveStatusInput>(EMPTY_STATUS_FORM);
  const [submitting, setSubmitting] = useState(false);

  const affiliation = teacher ? getCurrentAffiliation() : null;
  const archiveManager = teacher ? canManageStudentArchive(teacher, affiliation) : false;
  const homeroomClassIds = teacher ? getHomeroomClassIds(teacher, affiliation) : new Set<string>();

  const loadArchive = useCallback(async (showLoading = false) => {
    if (!teacher?.schoolId || !teacher.id) return;
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const next = await classService.listMyStudentArchives(teacher.schoolId, teacher.id);
      setOverview(next);
      setExpandedClassIds((current) => current.size > 0 ? current : new Set(next.classes.map((item) => item.id)));
      setSelectedStudentId((current) => (
        current && next.students.some((student) => student.id === current)
          ? current
          : next.students[0]?.id || null
      ));
      setLastRefreshedAt(new Date().toISOString());
    } catch (error) {
      toast.error("加载学生档案失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teacher]);

  useEffect(() => {
    void loadArchive(true);
  }, [loadArchive]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadArchive(false), 30_000);
    return () => window.clearInterval(timer);
  }, [loadArchive]);

  const classMap = useMemo(() => new Map(overview.classes.map((item) => [item.id, item])), [overview.classes]);
  const selectedStudent = overview.students.find((student) => student.id === selectedStudentId) || null;
  const selectedClass = selectedStudent
    ? classMap.get(selectedStudent.classId)
      || overview.classes.find((classInfo) =>
        classInfo.type === "personal" && classInfo.studentIds.includes(selectedStudent.id),
      )
      || null
    : null;
  const selectedStatus = selectedStudent ? getStudentArchiveStatus(selectedStudent) : null;
  const canEditSelectedContacts = Boolean(
    selectedStudent && (archiveManager || homeroomClassIds.has(selectedStudent.classId)),
  );
  const canEditSelectedStatus = Boolean(
    selectedStudent
    && selectedStatus
    && (archiveManager
      ? selectedStatus !== "transferred" && selectedStatus !== "graduated"
      : homeroomClassIds.has(selectedStudent.classId)
        && (
          ["attending", "studyAway", "visiting"].includes(selectedStatus)
          || (
            selectedStatus === "leave"
            && (
              !selectedStudent.archiveStatusBeforeLeave
              || ["attending", "studyAway", "visiting"].includes(selectedStudent.archiveStatusBeforeLeave)
            )
          )
        )),
  );

  const filteredStudents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return overview.students.filter((student) => {
      const matchesKeyword = !normalizedKeyword
        || student.name.toLowerCase().includes(normalizedKeyword)
        || student.studentNo.toLowerCase().includes(normalizedKeyword)
        || student.contacts?.guardianName?.toLowerCase().includes(normalizedKeyword)
        || student.contacts?.guardianPhone?.includes(normalizedKeyword);
      const matchesStatus = statusFilter === "all" || getStudentArchiveStatus(student) === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [keyword, overview.students, statusFilter]);

  const classGroups = useMemo(() => overview.classes.map((classInfo) => {
    const ids = classStudentIds(classInfo, filteredStudents);
    return {
      classInfo,
      students: filteredStudents.filter((student) => ids.has(student.id)),
    };
  }).filter((group) => group.students.length > 0), [filteredStudents, overview.classes]);

  useEffect(() => {
    if (filteredStudents.length === 0) {
      if (selectedStudentId !== null) setSelectedStudentId(null);
      return;
    }
    if (!filteredStudents.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, selectedStudentId]);

  const selectedRecords = useMemo(() => overview.records.filter(
    (record) => record.studentId === selectedStudentId,
  ), [overview.records, selectedStudentId]);

  const statusCounts = useMemo(() => {
    const counts = new Map<StudentArchiveStatus, number>();
    overview.students.forEach((student) => {
      const status = getStudentArchiveStatus(student);
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return counts;
  }, [overview.students]);

  const toggleClass = (classId: string) => {
    setExpandedClassIds((current) => {
      const next = new Set(current);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const openContacts = () => {
    if (!selectedStudent) return;
    setContactForm({ ...EMPTY_CONTACTS, ...selectedStudent.contacts, note: "" });
    setContactModalOpen(true);
  };

  const openStatus = (status?: Exclude<StudentArchiveStatus, "graduated">) => {
    if (!selectedStudent || !selectedStatus || selectedStatus === "graduated") return;
    setStatusForm({
      ...EMPTY_STATUS_FORM,
      status: status || (selectedStatus === "transferred" ? "attending" : selectedStatus),
      externalSchool: selectedStudent.externalSchool || "",
    });
    setStatusModalOpen(true);
  };

  const saveContacts = async () => {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      await classService.updateStudentContacts(selectedStudent.id, contactForm);
      toast.success("联系方式已更新");
      setContactModalOpen(false);
      await loadArchive(false);
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const saveStatus = async () => {
    if (!selectedStudent) return;
    if (["studyAway", "visiting"].includes(statusForm.status) && !statusForm.externalSchool?.trim()) {
      toast.error("请填写借读学校");
      return;
    }
    setSubmitting(true);
    try {
      await classService.updateStudentArchiveStatus(selectedStudent.id, statusForm);
      toast.success("学生状态已更新");
      setStatusModalOpen(false);
      await loadArchive(false);
    } catch (error) {
      toast.error("更新失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="按状态筛选"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StudentArchiveStatus | "all")}
            options={[
              { value: "all", label: `全部状态（${overview.students.length}）` },
              ...Object.entries(STUDENT_ARCHIVE_STATUS_META).map(([value, meta]) => ({
                value,
                label: `${meta.label}（${statusCounts.get(value as StudentArchiveStatus) || 0}）`,
              })),
            ]}
            className="min-w-44"
          />
          <div className="text-xs text-ink-400">
            {lastRefreshedAt ? `最近同步 ${formatDateTime(lastRefreshedAt)}` : "正在同步档案"}
          </div>
        </div>
        <Button variant="outline" size="sm" loading={refreshing} onClick={() => void loadArchive(false)}>
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      <ResizableSplitPane
        storageKey="inteschool:student-archive-sidebar-width"
        className="min-h-[calc(100vh-13rem)]"
        sidebarClassName="h-full"
        contentClassName="h-full"
        sidebar={
          <Card className="h-full p-0 overflow-hidden">
            <div className="border-b border-ink-100 p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索姓名、学号或联系方式"
                  className="input-base w-full pl-9 text-sm"
                />
              </div>
            </div>
            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-3">
              {loading ? (
                <div className="py-12 text-center text-sm text-ink-400">正在加载学生档案...</div>
              ) : classGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-ink-400">没有符合条件的学生</div>
              ) : (
                <div className="space-y-2">
                  {classGroups.map(({ classInfo, students }) => {
                    const expanded = expandedClassIds.has(classInfo.id);
                    return (
                      <section key={classInfo.id}>
                        <button
                          type="button"
                          onClick={() => toggleClass(classInfo.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-ink-700 hover:bg-mist"
                          aria-expanded={expanded}
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <GraduationCap className="h-4 w-4 text-gold-600" />
                          <span className="min-w-0 flex-1 truncate">{classInfo.name}</span>
                          <span className="text-xs font-normal text-ink-400">{students.length}</span>
                        </button>
                        {expanded && (
                          <div className="mt-1 space-y-1 pl-2">
                            {students.map((student) => {
                              const status = getStudentArchiveStatus(student);
                              return (
                                <button
                                  key={student.id}
                                  type="button"
                                  onClick={() => setSelectedStudentId(student.id)}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                                    selectedStudentId === student.id ? "bg-gold-50 text-gold-800" : "hover:bg-mist text-ink-700",
                                  )}
                                >
                                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700">
                                    {student.name.slice(0, 1)}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{student.name}</span>
                                    <span className="block truncate text-[11px] text-ink-400">{student.studentNo || "暂无学号"}</span>
                                  </span>
                                  <Badge variant={statusVariant(status)} className="text-[10px]">
                                    {STUDENT_ARCHIVE_STATUS_META[status].label.replace("在籍 · ", "")}
                                  </Badge>
                                </button>
                              );
                            })}
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
        {!selectedStudent || !selectedStatus ? (
          <Card className="flex min-h-[28rem] items-center justify-center text-sm text-ink-400">
            请选择一名学生查看档案
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gold-400 text-xl font-semibold text-ink-950">
                    {selectedStudent.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-xl font-semibold text-ink-900">{selectedStudent.name}</h2>
                      <Badge variant={statusVariant(selectedStatus)}>{STUDENT_ARCHIVE_STATUS_META[selectedStatus].label}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-ink-500">
                      学号：{selectedStudent.studentNo || "未填写"} · 班级：{selectedClass?.name || "未分班"} · 年级：{selectedStudent.grade || "未填写"}
                    </div>
                    <div className="mt-1 text-xs text-ink-400">{STUDENT_ARCHIVE_STATUS_META[selectedStatus].description}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEditSelectedContacts && (
                    <Button variant="outline" size="sm" onClick={openContacts}>
                      <ContactRound className="h-3.5 w-3.5" />
                      补充联系方式
                    </Button>
                  )}
                  {archiveManager && canEditSelectedStatus && (
                    <Button variant="gold" size="sm" onClick={() => openStatus()}>
                      <Archive className="h-3.5 w-3.5" />
                      更新状态
                    </Button>
                  )}
                  {!archiveManager && canEditSelectedStatus && selectedStatus !== "leave" && (
                    <Button variant="gold" size="sm" onClick={() => openStatus("leave")}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      登记请假
                    </Button>
                  )}
                  {!archiveManager && canEditSelectedStatus && selectedStatus === "leave" && selectedStudent && (
                    <Button variant="gold" size="sm" onClick={() => openStatus(getStudentStatusAfterLeave(selectedStudent))}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      结束请假
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <div className="mb-4 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gold-600" />
                  <h3 className="font-serif font-semibold text-ink-900">联系方式</h3>
                </div>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
                  <dt className="text-ink-400">学生手机</dt>
                  <dd className="text-ink-700">{selectedStudent.contacts?.studentPhone || "未补充"}</dd>
                  <dt className="text-ink-400">监护人</dt>
                  <dd className="text-ink-700">{selectedStudent.contacts?.guardianName || "未补充"}</dd>
                  <dt className="text-ink-400">监护人电话</dt>
                  <dd className="text-ink-700">{selectedStudent.contacts?.guardianPhone || "未补充"}</dd>
                  <dt className="text-ink-400">紧急联系人</dt>
                  <dd className="text-ink-700">
                    {[selectedStudent.contacts?.emergencyContact, selectedStudent.contacts?.emergencyPhone].filter(Boolean).join(" · ") || "未补充"}
                  </dd>
                </dl>
              </Card>

              <Card>
                <div className="mb-4 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-gold-600" />
                  <h3 className="font-serif font-semibold text-ink-900">学籍与就读信息</h3>
                </div>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
                  <dt className="text-ink-400">当前状态</dt>
                  <dd><Badge variant={statusVariant(selectedStatus)}>{STUDENT_ARCHIVE_STATUS_META[selectedStatus].label}</Badge></dd>
                  <dt className="text-ink-400">学生类型</dt>
                  <dd className="text-ink-700">{selectedStudent.isExternal ? "外校学籍学生" : "本校学籍学生"}</dd>
                  <dt className="text-ink-400">借读学校</dt>
                  <dd className="text-ink-700">{selectedStudent.externalSchool || "无"}</dd>
                  <dt className="text-ink-400">操作权限</dt>
                  <dd className="text-ink-700">
                    {archiveManager ? "可管理全校学生档案" : homeroomClassIds.has(selectedStudent.classId) ? "可处理本班联系方式与请假" : "只读"}
                  </dd>
                </dl>
              </Card>
            </div>

            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-gold-600" />
                  <h3 className="font-serif font-semibold text-ink-900">档案记录</h3>
                </div>
                <span className="text-xs text-ink-400">共 {selectedRecords.length} 条</span>
              </div>
              {selectedRecords.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
                  暂无档案变更记录
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedRecords.map((record) => (
                    <div key={record.id} className="relative border-l-2 border-gold-200 pl-5">
                      <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-paper bg-gold-500" />
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-ink-800">{recordTitle(record)}</div>
                          {record.previousStatus && record.status && (
                            <div className="mt-1 text-xs text-ink-500">
                              {STUDENT_ARCHIVE_STATUS_META[record.previousStatus].label} → {STUDENT_ARCHIVE_STATUS_META[record.status].label}
                            </div>
                          )}
                          {record.externalSchool && <div className="mt-1 text-xs text-ink-500">借读学校：{record.externalSchool}</div>}
                          {(record.startDate || record.endDate) && (
                            <div className="mt-1 text-xs text-ink-500">有效期：{record.startDate || "未填写"} 至 {record.endDate || "未填写"}</div>
                          )}
                          {record.note && <div className="mt-2 rounded-md bg-mist px-3 py-2 text-sm text-ink-600">{record.note}</div>}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-ink-400">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatDateTime(record.createdAt)} · {record.createdByName}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </ResizableSplitPane>

      <Modal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        title={`补充${selectedStudent ? `「${selectedStudent.name}」` : "学生"}联系方式`}
        description="班主任和年级组长以上身份可维护，修改会写入档案记录。"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setContactModalOpen(false)}>取消</Button>
            <Button variant="gold" loading={submitting} onClick={() => void saveContacts()}>保存联系方式</Button>
          </>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="学生手机" value={contactForm.studentPhone || ""} onChange={(event) => setContactForm((current) => ({ ...current, studentPhone: event.target.value }))} />
          <Input label="监护人姓名" value={contactForm.guardianName || ""} onChange={(event) => setContactForm((current) => ({ ...current, guardianName: event.target.value }))} />
          <Input label="监护人电话" value={contactForm.guardianPhone || ""} onChange={(event) => setContactForm((current) => ({ ...current, guardianPhone: event.target.value }))} />
          <Input label="紧急联系人" value={contactForm.emergencyContact || ""} onChange={(event) => setContactForm((current) => ({ ...current, emergencyContact: event.target.value }))} />
          <Input label="紧急联系电话" value={contactForm.emergencyPhone || ""} onChange={(event) => setContactForm((current) => ({ ...current, emergencyPhone: event.target.value }))} />
          <div className="sm:col-span-2">
            <Textarea label="备注" value={contactForm.note || ""} onChange={(event) => setContactForm((current) => ({ ...current, note: event.target.value }))} placeholder="说明本次补充或变更原因" />
          </div>
        </div>
      </Modal>

      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`更新${selectedStudent ? `「${selectedStudent.name}」` : "学生"}状态`}
        description={archiveManager ? "可登记在读、借读、请假、休学和转学等状态。" : "班主任仅可登记或结束本班学生请假。"}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setStatusModalOpen(false)}>取消</Button>
            <Button variant="gold" loading={submitting} onClick={() => void saveStatus()}>确认更新</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Select
            label="当前状态"
            value={statusForm.status}
            disabled={!archiveManager}
            onChange={(event) => setStatusForm((current) => ({
              ...current,
              status: event.target.value as Exclude<StudentArchiveStatus, "graduated">,
            }))}
            options={archiveManager
              ? STATUS_OPTIONS
              : STATUS_OPTIONS.filter((item) => item.value === "leave" || item.value === statusForm.status)}
          />
          {["studyAway", "visiting"].includes(statusForm.status) && (
            <Input
              label="借读学校"
              required
              value={statusForm.externalSchool || ""}
              onChange={(event) => setStatusForm((current) => ({ ...current, externalSchool: event.target.value }))}
              placeholder={statusForm.status === "studyAway" ? "学生当前借读的外校" : "学生学籍所在学校"}
            />
          )}
          {["leave", "studyAway", "visiting", "suspended"].includes(statusForm.status) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="开始日期" type="date" value={statusForm.startDate || ""} onChange={(event) => setStatusForm((current) => ({ ...current, startDate: event.target.value }))} />
              <Input label="结束日期" type="date" value={statusForm.endDate || ""} onChange={(event) => setStatusForm((current) => ({ ...current, endDate: event.target.value }))} />
            </div>
          )}
          <Textarea
            label="原因与说明"
            value={statusForm.note || ""}
            onChange={(event) => setStatusForm((current) => ({ ...current, note: event.target.value }))}
            placeholder="填写请假、借读、休学或转学原因"
          />
        </div>
      </Modal>
    </div>
  );
}

export default StudentArchivePage;

import { useEffect, useMemo, useState } from "react";
import {
  Network, Plus, Users, UserPlus, Trash2, ChevronRight, ChevronDown,
  Crown, BookOpen, Check, ShieldCheck, GraduationCap, Layers,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import {
  organizationService,
  roleLabels,
  roleBadgeVariants,
  canManage,
} from "@/services/organization";
import { toast } from "@/stores/ui";
import { formatDate } from "@/lib/service-utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import type { SubjectGroup, PrepGroup, Teacher, TeacherRole } from "@/types";

// ============ 常量 ============

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "政治", "历史", "地理", "信息技术"];

// 权限矩阵：资源层级
const PERMISSION_LEVELS: { key: "personal" | "prep" | "subject" | "grade" | "school"; label: string }[] = [
  { key: "personal", label: "个人" },
  { key: "prep", label: "备课组" },
  { key: "subject", label: "学科组" },
  { key: "grade", label: "年级" },
  { key: "school", label: "学校" },
];

// 权限矩阵：角色列
const PERMISSION_ROLES: TeacherRole[] = [
  "teacher", "prepLeader", "subjectLeader", "gradeLeader", "dean", "principal",
];

// 当前选中项类型
type Selection = { type: "subject"; id: string } | { type: "prep"; id: string };

// ============ 角色徽章 ============
// roleBadgeVariants 中 blue / purple 不在 Badge 默认变体中，这里做一层映射
function RoleBadge({ role }: { role: TeacherRole }) {
  const v = roleBadgeVariants[role];
  if (v === "blue") {
    return <Badge className="bg-blue-50 text-blue-700 border-blue-200">{roleLabels[role]}</Badge>;
  }
  if (v === "purple") {
    return <Badge className="bg-purple-50 text-purple-700 border-purple-200">{roleLabels[role]}</Badge>;
  }
  return <Badge variant={v}>{roleLabels[role]}</Badge>;
}

// ============ 权限矩阵卡片 ============
function PermissionMatrix() {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-gold-600" />
        <h3 className="font-serif text-base font-semibold text-ink-900">权限矩阵</h3>
      </div>
      <p className="text-xs text-ink-500 mb-3">
        行为资源层级，列为教师角色，<span className="text-emerald-600 font-medium">✓</span> 表示该角色可管理对应层级资源。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-mist">
              <th className="text-left px-3 py-2 font-medium text-ink-700 border border-ink-100 whitespace-nowrap">
                资源层级
              </th>
              {PERMISSION_ROLES.map((r) => (
                <th
                  key={r}
                  className="px-3 py-2 font-medium text-ink-700 border border-ink-100 text-center whitespace-nowrap"
                >
                  {roleLabels[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_LEVELS.map((lv) => (
              <tr key={lv.key}>
                <td className="px-3 py-2 font-medium text-ink-800 border border-ink-100 bg-mist/40 whitespace-nowrap">
                  {lv.label}
                </td>
                {PERMISSION_ROLES.map((r) => {
                  const ok = canManage([r], lv.key);
                  return (
                    <td key={r} className="px-3 py-2 border border-ink-100 text-center">
                      {ok ? (
                        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============ 主页面 ============
export default function OrganizationPage() {
  const { teacher } = useAuthStore();
  const { gradeOptions, defaultGrade } = useSchoolResourceOptions(teacher?.schoolId);

  const [subjectGroups, setSubjectGroups] = useState<SubjectGroup[]>([]);
  const [prepGroups, setPrepGroups] = useState<PrepGroup[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 选中项与展开状态
  const [selected, setSelected] = useState<Selection | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 新建学科组弹窗
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [sgName, setSgName] = useState("");
  const [sgSubject, setSgSubject] = useState("数学");
  const [sgDesc, setSgDesc] = useState("");
  const [sgLeaderId, setSgLeaderId] = useState("");

  // 新建备课组弹窗
  const [createPrepOpen, setCreatePrepOpen] = useState(false);
  const [prepSubjectGroupId, setPrepSubjectGroupId] = useState("");
  const [pgName, setPgName] = useState("");
  const [pgGrade, setPgGrade] = useState("");
  const [pgDesc, setPgDesc] = useState("");
  const [pgLeaderId, setPgLeaderId] = useState("");

  // 添加成员弹窗
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberTarget, setAddMemberTarget] = useState<Selection | null>(null);
  const [pendingTeacherIds, setPendingTeacherIds] = useState<Set<string>>(new Set());
  const [memberSearchKw, setMemberSearchKw] = useState("");

  const schoolId = teacher?.schoolId ?? null;
  const roles = teacher?.roles ?? [];

  // 权限判断
  const canCreateSubject = canManage(roles, "school") || canManage(roles, "subject");
  const canEditSubject = canManage(roles, "subject");
  const canCreatePrep = canManage(roles, "subject") || canManage(roles, "prep");
  const canEditPrep = canManage(roles, "prep") || canManage(roles, "subject");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    const [sg, pg, ts] = await Promise.all([
      organizationService.listSubjectGroups(schoolId),
      organizationService.listPrepGroups(schoolId),
      organizationService.listTeachers(schoolId),
    ]);
    setSubjectGroups(sg);
    setPrepGroups(pg);
    setTeachers(ts);
    setLoading(false);
  };

  // 当前选中的学科组 / 备课组
  const selectedSubjectGroup = useMemo(
    () => (selected?.type === "subject" ? subjectGroups.find((g) => g.id === selected.id) ?? null : null),
    [selected, subjectGroups],
  );
  const selectedPrepGroup = useMemo(
    () => (selected?.type === "prep" ? prepGroups.find((g) => g.id === selected.id) ?? null : null),
    [selected, prepGroups],
  );

  // 当前组的成员与组长
  const currentMembers = useMemo<Teacher[]>(() => {
    const ids = selectedSubjectGroup?.memberIds ?? selectedPrepGroup?.memberIds ?? [];
    return ids.map((id) => teachers.find((t) => t.id === id)).filter((t): t is Teacher => !!t);
  }, [selectedSubjectGroup, selectedPrepGroup, teachers]);

  const currentLeader = useMemo<Teacher | null>(() => {
    const lid = selectedSubjectGroup?.leaderId ?? selectedPrepGroup?.leaderId ?? null;
    return lid ? teachers.find((t) => t.id === lid) ?? null : null;
  }, [selectedSubjectGroup, selectedPrepGroup, teachers]);

  // 备课组按学科组分组
  const prepsOf = (sgId: string) => prepGroups.filter((p) => p.subjectGroupId === sgId);

  // 组长下拉选项
  const teacherOptions = useMemo(
    () => teachers.map((t) => ({ value: t.id, label: `${t.name}（${t.subject}）` })),
    [teachers],
  );

  // 添加成员弹窗：目标组的现有成员
  const addMemberCurrentIds = useMemo<string[]>(() => {
    if (!addMemberTarget) return [];
    if (addMemberTarget.type === "subject") {
      return subjectGroups.find((g) => g.id === addMemberTarget.id)?.memberIds ?? [];
    }
    return prepGroups.find((g) => g.id === addMemberTarget.id)?.memberIds ?? [];
  }, [addMemberTarget, subjectGroups, prepGroups]);

  const addMemberTargetName = useMemo(() => {
    if (!addMemberTarget) return "";
    return addMemberTarget.type === "subject"
      ? subjectGroups.find((g) => g.id === addMemberTarget.id)?.name
      : prepGroups.find((g) => g.id === addMemberTarget.id)?.name;
  }, [addMemberTarget, subjectGroups, prepGroups]);

  const filteredTeachers = useMemo(() => {
    const kw = memberSearchKw.trim().toLowerCase();
    if (!kw) return teachers;
    return teachers.filter(
      (t) => t.name.toLowerCase().includes(kw) || t.subject.toLowerCase().includes(kw),
    );
  }, [teachers, memberSearchKw]);

  // ============ 交互处理 ============

  const selectSubject = (id: string) => {
    setSelected({ type: "subject", id });
    // 选中时自动展开
    setExpandedIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  };
  const selectPrep = (id: string) => setSelected({ type: "prep", id });
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const openCreateSubject = () => {
    setSgName("");
    setSgSubject("数学");
    setSgDesc("");
    setSgLeaderId("");
    setCreateSubjectOpen(true);
  };

  const openCreatePrep = (subjectGroupId: string) => {
    setPrepSubjectGroupId(subjectGroupId);
    setPgName("");
    setPgGrade(defaultGrade);
    setPgDesc("");
    setPgLeaderId("");
    setCreatePrepOpen(true);
  };

  const openAddMember = (target: Selection) => {
    setAddMemberTarget(target);
    setPendingTeacherIds(new Set());
    setMemberSearchKw("");
    setAddMemberOpen(true);
  };

  const toggleTeacher = (id: string) =>
    setPendingTeacherIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const handleCreateSubject = async () => {
    if (!schoolId) return;
    if (!sgName.trim()) {
      toast.error("请填写学科组名称");
      return;
    }
    if (!sgSubject) {
      toast.error("请选择学科");
      return;
    }
    setSubmitting(true);
    try {
      const g = await organizationService.createSubjectGroup(schoolId, {
        name: sgName.trim(),
        subject: sgSubject,
        description: sgDesc.trim() || undefined,
        leaderId: sgLeaderId || undefined,
      });
      toast.success("学科组已创建");
      setCreateSubjectOpen(false);
      await load();
      setSelected({ type: "subject", id: g.id });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePrep = async () => {
    if (!schoolId) return;
    if (!prepSubjectGroupId) {
      toast.error("缺少所属学科组");
      return;
    }
    if (!pgName.trim()) {
      toast.error("请填写备课组名称");
      return;
    }
    setSubmitting(true);
    try {
      const g = await organizationService.createPrepGroup(schoolId, {
        subjectGroupId: prepSubjectGroupId,
        name: pgName.trim(),
        grade: pgGrade,
        description: pgDesc.trim() || undefined,
        leaderId: pgLeaderId || undefined,
      });
      toast.success("备课组已创建");
      setCreatePrepOpen(false);
      await load();
      setSelected({ type: "prep", id: g.id });
      setExpandedIds((prev) => new Set([...prev, prepSubjectGroupId]));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubject = async (id: string) => {
    const sg = subjectGroups.find((g) => g.id === id);
    if (!sg) return;
    if (!confirm(`确定删除学科组「${sg.name}」？其下所有备课组也将一并删除。`)) return;
    await organizationService.deleteSubjectGroup(id);
    toast.success("学科组已删除");
    if (selected?.id === id) setSelected(null);
    await load();
  };

  const handleDeletePrep = async (id: string) => {
    const pg = prepGroups.find((g) => g.id === id);
    if (!pg) return;
    if (!confirm(`确定删除备课组「${pg.name}」？`)) return;
    await organizationService.deletePrepGroup(id);
    toast.success("备课组已删除");
    if (selected?.id === id) setSelected(null);
    await load();
  };

  const handleRemoveMember = async (teacherId: string) => {
    if (!selected) return;
    if (selected.type === "subject") {
      await organizationService.removeMember(selected.id, teacherId);
    } else {
      await organizationService.removePrepMember(selected.id, teacherId);
    }
    toast.success("已移出本组");
    await load();
  };

  const handleAddMembers = async () => {
    if (!addMemberTarget) return;
    const ids = Array.from(pendingTeacherIds);
    if (ids.length === 0) {
      toast.error("请至少选择一名教师");
      return;
    }
    setSubmitting(true);
    try {
      if (addMemberTarget.type === "subject") {
        for (const id of ids) await organizationService.addMember(addMemberTarget.id, id);
      } else {
        for (const id of ids) await organizationService.addPrepMember(addMemberTarget.id, id);
      }
      toast.success(`已添加 ${ids.length} 名教师`);
      setAddMemberOpen(false);
      setPendingTeacherIds(new Set());
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  // ============ 渲染 ============

  // 未加入学校
  if (!schoolId) {
    return (
      <div>
        <PageHeader
          title="组织架构"
          description="管理学科组、备课组及教师身份权限"
          icon={<Network className="w-5 h-5" />}
        />
        <Card>
          <EmptyState
            icon={<GraduationCap className="w-7 h-7" />}
            title="尚未加入学校"
            description="请先完成学校认证后再管理组织架构"
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="组织架构"
        description="管理学科组、备课组及教师身份权限"
        icon={<Network className="w-5 h-5" />}
      />

      <div className="grid lg:grid-cols-12 gap-5">
        {/* 左栏：学科组树形列表 */}
        <div className="lg:col-span-5">
          <Card className="sticky top-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-ink-500" />
                <h3 className="font-serif text-base font-semibold text-ink-900">学科组</h3>
                <span className="text-xs text-ink-400">({subjectGroups.length})</span>
              </div>
              {canCreateSubject && (
                <Button variant="gold" size="sm" onClick={openCreateSubject}>
                  <Plus className="w-3.5 h-3.5" />
                  新建学科组
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner size={20} />
              </div>
            ) : subjectGroups.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-7 h-7" />}
                title="暂无学科组"
                description={canCreateSubject ? "点击右上角「新建学科组」开始创建" : "请联系教务主任或校长创建学科组"}
              />
            ) : (
              <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
                {subjectGroups.map((sg) => {
                  const expanded = expandedIds.has(sg.id);
                  const preps = prepsOf(sg.id);
                  const isSelected = selected?.type === "subject" && selected.id === sg.id;
                  return (
                    <div key={sg.id}>
                      {/* 学科组项 */}
                      <div
                        className={cn(
                          "group flex items-center gap-2 p-2.5 rounded-md border transition-all cursor-pointer",
                          isSelected
                            ? "border-gold-300 bg-gold-50/40"
                            : "border-ink-100 hover:bg-mist",
                        )}
                        onClick={() => selectSubject(sg.id)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(sg.id);
                          }}
                          className="p-0.5 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100"
                          aria-label={expanded ? "收起" : "展开"}
                        >
                          {expanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink-900 truncate">{sg.name}</div>
                          <div className="text-xs text-ink-500 truncate">
                            {sg.subject} · {sg.memberIds.length} 人
                            {preps.length > 0 && ` · ${preps.length} 个备课组`}
                          </div>
                        </div>
                        {canEditSubject && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSubject(sg.id);
                            }}
                            className="p-1 text-ink-300 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="删除学科组"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* 备课组列表 */}
                      {expanded && (
                        <div className="ml-4 mt-1 space-y-1 border-l border-ink-100 pl-3">
                          {preps.length === 0 ? (
                            <div className="text-xs text-ink-400 py-1.5">暂无备课组</div>
                          ) : (
                            preps.map((pg) => {
                              const isPrepSelected =
                                selected?.type === "prep" && selected.id === pg.id;
                              return (
                                <div
                                  key={pg.id}
                                  className={cn(
                                    "group flex items-center gap-2 p-2 rounded-md border transition-all cursor-pointer",
                                    isPrepSelected
                                      ? "border-gold-300 bg-gold-50/40"
                                      : "border-transparent hover:bg-mist hover:border-ink-100",
                                  )}
                                  onClick={() => selectPrep(pg.id)}
                                >
                                  <div className="w-6 h-6 rounded bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                                    <Users className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-ink-800 truncate">{pg.name}</div>
                                    <div className="text-xs text-ink-500 truncate">
                                      {pg.grade} · {pg.memberIds.length} 人
                                    </div>
                                  </div>
                                  {canEditPrep && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePrep(pg.id);
                                      }}
                                      className="p-1 text-ink-300 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      aria-label="删除备课组"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* 右栏：详情面板 */}
        <div className="lg:col-span-7">
          {!selected ? (
            <Card>
              <EmptyState
                icon={<Users className="w-7 h-7" />}
                title="请选择一个组"
                description="从左侧选择学科组或备课组，查看详情与成员名单"
              />
            </Card>
          ) : selectedSubjectGroup ? (
            <SubjectDetailPanel
              group={selectedSubjectGroup}
              leader={currentLeader}
              members={currentMembers}
              canEdit={canEditSubject}
              canCreatePrep={canCreatePrep}
              onAddMember={() => openAddMember({ type: "subject", id: selectedSubjectGroup.id })}
              onCreatePrep={() => openCreatePrep(selectedSubjectGroup.id)}
              onRemoveMember={handleRemoveMember}
            />
          ) : selectedPrepGroup ? (
            <PrepDetailPanel
              group={selectedPrepGroup}
              subjectGroup={subjectGroups.find((g) => g.id === selectedPrepGroup.subjectGroupId) ?? null}
              leader={currentLeader}
              members={currentMembers}
              canEdit={canEditPrep}
              onAddMember={() => openAddMember({ type: "prep", id: selectedPrepGroup.id })}
              onRemoveMember={handleRemoveMember}
            />
          ) : null}
        </div>
      </div>

      {/* 底部：权限矩阵 */}
      <div className="mt-5">
        <PermissionMatrix />
      </div>

      {/* ============ 新建学科组弹窗 ============ */}
      <Modal
        open={createSubjectOpen}
        onClose={() => setCreateSubjectOpen(false)}
        title="新建学科组"
        description="学科组按学科划分，统领本学科各年级备课组"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateSubjectOpen(false)}>
              取消
            </Button>
            <Button variant="gold" loading={submitting} onClick={handleCreateSubject}>
              <Plus className="w-3.5 h-3.5" />
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="学科组名称"
            placeholder="如：北京四中数学组"
            value={sgName}
            onChange={(e) => setSgName(e.target.value)}
            autoFocus
          />
          <Select
            label="学科"
            value={sgSubject}
            onChange={(e) => setSgSubject(e.target.value)}
            options={SUBJECTS.map((s) => ({ value: s, label: s }))}
          />
          <Textarea
            label="描述（可选）"
            placeholder="学科组简介、职责说明等"
            value={sgDesc}
            onChange={(e) => setSgDesc(e.target.value)}
          />
          <Select
            label="组长（可选）"
            placeholder="请选择组长"
            value={sgLeaderId}
            onChange={(e) => setSgLeaderId(e.target.value)}
            options={teacherOptions}
          />
        </div>
      </Modal>

      {/* ============ 新建备课组弹窗 ============ */}
      <Modal
        open={createPrepOpen}
        onClose={() => setCreatePrepOpen(false)}
        title="新建备课组"
        description={
          prepSubjectGroupId
            ? `所属学科组：${subjectGroups.find((g) => g.id === prepSubjectGroupId)?.name ?? ""}`
            : undefined
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreatePrepOpen(false)}>
              取消
            </Button>
            <Button variant="gold" loading={submitting} onClick={handleCreatePrep}>
              <Plus className="w-3.5 h-3.5" />
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="备课组名称"
            placeholder="如：高一数学备课组"
            value={pgName}
            onChange={(e) => setPgName(e.target.value)}
            autoFocus
          />
          <Select
            label="年级"
            value={pgGrade}
            onChange={(e) => setPgGrade(e.target.value)}
            options={gradeOptions}
          />
          <Textarea
            label="描述（可选）"
            placeholder="备课组职责说明等"
            value={pgDesc}
            onChange={(e) => setPgDesc(e.target.value)}
          />
          <Select
            label="组长（可选）"
            placeholder="请选择组长"
            value={pgLeaderId}
            onChange={(e) => setPgLeaderId(e.target.value)}
            options={teacherOptions}
          />
        </div>
      </Modal>

      {/* ============ 添加成员弹窗 ============ */}
      <Modal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title="添加成员"
        description={addMemberTargetName ? `目标：${addMemberTargetName}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddMemberOpen(false)}>
              取消
            </Button>
            <Button variant="gold" loading={submitting} onClick={handleAddMembers}>
              <UserPlus className="w-3.5 h-3.5" />
              添加所选教师（{pendingTeacherIds.size}）
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="搜索教师姓名或学科"
            value={memberSearchKw}
            onChange={(e) => setMemberSearchKw(e.target.value)}
          />
          <div className="text-xs text-ink-500">
            共 {teachers.length} 名教师，已在本组 {addMemberCurrentIds.length} 名
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1.5">
            {filteredTeachers.length === 0 ? (
              <div className="text-center py-8 text-sm text-ink-400">未找到匹配的教师</div>
            ) : (
              filteredTeachers.map((t) => {
                const inGroup = addMemberCurrentIds.includes(t.id);
                const checked = inGroup || pendingTeacherIds.has(t.id);
                return (
                  <label
                    key={t.id}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-md border transition-colors",
                      inGroup
                        ? "bg-mist border-ink-100 cursor-not-allowed"
                        : "border-ink-100 hover:bg-mist cursor-pointer",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={inGroup}
                      onChange={() => toggleTeacher(t.id)}
                      className="w-4 h-4 accent-gold-500 flex-shrink-0"
                    />
                    <div className="w-8 h-8 rounded-full bg-gold-50 text-gold-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {t.avatar || t.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900 truncate">{t.name}</div>
                      <div className="text-xs text-ink-500 truncate">{t.subject}</div>
                    </div>
                    {inGroup && (
                      <Badge variant="teal" className="text-[10px]">
                        已添加
                      </Badge>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============ 学科组详情面板 ============
function SubjectDetailPanel({
  group,
  leader,
  members,
  canEdit,
  canCreatePrep,
  onAddMember,
  onCreatePrep,
  onRemoveMember,
}: {
  group: SubjectGroup;
  leader: Teacher | null;
  members: Teacher[];
  canEdit: boolean;
  canCreatePrep: boolean;
  onAddMember: () => void;
  onCreatePrep: () => void;
  onRemoveMember: (teacherId: string) => void;
}) {
  return (
    <Card>
      {/* 头部信息 */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-xl font-bold text-ink-900 truncate">{group.name}</h2>
              <Badge variant="ink">学科组</Badge>
            </div>
            <div className="text-sm text-ink-500 mt-0.5">
              {group.subject} · {group.memberIds.length} 名成员 · 创建于 {formatDate(group.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onAddMember}>
              <UserPlus className="w-3.5 h-3.5" />
              添加成员
            </Button>
          )}
          {canCreatePrep && (
            <Button variant="gold" size="sm" onClick={onCreatePrep}>
              <Plus className="w-3.5 h-3.5" />
              新建备课组
            </Button>
          )}
        </div>
      </div>

      {/* 描述 */}
      {group.description && (
        <p className="text-sm text-ink-600 bg-mist/50 rounded-md p-3 mb-4 leading-relaxed">
          {group.description}
        </p>
      )}

      {/* 组长信息 */}
      <div className="mb-5">
        <div className="text-xs font-medium text-ink-500 mb-1.5">组长</div>
        {leader ? <LeaderCard teacher={leader} /> : <div className="text-sm text-ink-400">未指定组长</div>}
      </div>

      {/* 成员列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-ink-500">
            成员（{members.length}）
          </div>
        </div>
        <MemberList
          members={members}
          leaderId={group.leaderId}
          canRemove={canEdit}
          onRemove={onRemoveMember}
          emptyText="暂无成员，点击「添加成员」加入教师"
        />
      </div>
    </Card>
  );
}

// ============ 备课组详情面板 ============
function PrepDetailPanel({
  group,
  subjectGroup,
  leader,
  members,
  canEdit,
  onAddMember,
  onRemoveMember,
}: {
  group: PrepGroup;
  subjectGroup: SubjectGroup | null;
  leader: Teacher | null;
  members: Teacher[];
  canEdit: boolean;
  onAddMember: () => void;
  onRemoveMember: (teacherId: string) => void;
}) {
  return (
    <Card>
      {/* 头部信息 */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-xl font-bold text-ink-900 truncate">{group.name}</h2>
              <Badge variant="teal">备课组</Badge>
            </div>
            <div className="text-sm text-ink-500 mt-0.5">
              {group.grade}
              {subjectGroup ? ` · 属于 ${subjectGroup.name}` : ""}
              {" · "}{group.memberIds.length} 名成员 · 创建于 {formatDate(group.createdAt)}
            </div>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onAddMember} className="flex-shrink-0">
            <UserPlus className="w-3.5 h-3.5" />
            添加成员
          </Button>
        )}
      </div>

      {/* 描述 */}
      {group.description && (
        <p className="text-sm text-ink-600 bg-mist/50 rounded-md p-3 mb-4 leading-relaxed">
          {group.description}
        </p>
      )}

      {/* 组长信息 */}
      <div className="mb-5">
        <div className="text-xs font-medium text-ink-500 mb-1.5">组长</div>
        {leader ? <LeaderCard teacher={leader} /> : <div className="text-sm text-ink-400">未指定组长</div>}
      </div>

      {/* 成员列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-ink-500">
            成员（{members.length}）
          </div>
        </div>
        <MemberList
          members={members}
          leaderId={group.leaderId}
          canRemove={canEdit}
          onRemove={onRemoveMember}
          emptyText="暂无成员，点击「添加成员」加入教师"
        />
      </div>
    </Card>
  );
}

// ============ 组长卡片 ============
function LeaderCard({ teacher }: { teacher: Teacher }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-gold-200 bg-gold-50/40">
      <div className="w-10 h-10 rounded-full bg-gold-100 text-gold-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
        {teacher.avatar || teacher.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-ink-900">{teacher.name}</span>
          <Badge variant="gold" className="text-[10px]">
            <Crown className="w-2.5 h-2.5" />
            组长
          </Badge>
        </div>
        <div className="text-xs text-ink-500 mt-0.5">
          {teacher.subject}
          {teacher.employeeNo ? ` · 工号 ${teacher.employeeNo}` : ""}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 justify-end max-w-[50%]">
        {teacher.roles.map((r) => (
          <RoleBadge key={r} role={r} />
        ))}
      </div>
    </div>
  );
}

// ============ 成员列表 ============
function MemberList({
  members,
  leaderId,
  canRemove,
  onRemove,
  emptyText,
}: {
  members: Teacher[];
  leaderId: string | null;
  canRemove: boolean;
  onRemove: (teacherId: string) => void;
  emptyText: string;
}) {
  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-ink-400 border border-dashed border-ink-200 rounded-md">
        <Users className="w-7 h-7 mx-auto mb-2 text-ink-200" />
        {emptyText}
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {members.map((t) => {
        const isLeader = t.id === leaderId;
        return (
          <div
            key={t.id}
            className="group flex items-center gap-2.5 p-2.5 rounded-md border border-ink-100 hover:bg-mist/60 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-gold-50 text-gold-700 flex items-center justify-center text-sm font-medium flex-shrink-0">
              {t.avatar || t.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-ink-900 truncate">{t.name}</span>
                {isLeader && (
                  <Badge variant="gold" className="text-[10px] px-1.5 py-0">
                    <Crown className="w-2.5 h-2.5" />
                    组长
                  </Badge>
                )}
              </div>
              <div className="text-xs text-ink-500 mt-0.5 truncate">
                {t.subject}
                {t.roles.filter((r) => r !== "teacher").length > 0
                  ? " · " + t.roles.filter((r) => r !== "teacher").map((r) => roleLabels[r]).join("、")
                  : " · 教师"}
              </div>
            </div>
            {canRemove && !isLeader && (
              <button
                onClick={() => onRemove(t.id)}
                className="p-1.5 text-ink-300 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                aria-label="移出本组"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

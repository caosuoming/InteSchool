import { useCallback, useState, useEffect } from "react";
import { useParams } from "react-router";
import {
  Plus,
  Edit3,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Users,
  BookOpen,
  Calendar,
  User,
  ChevronRight,
} from "lucide-react";
import {
  prepService,
  taskTypeLabels,
  taskStatusLabels,
  assignmentStatusLabels,
} from "@/services/prep";
import { organizationService } from "@/services/organization";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type {
  PrepTask,
  PrepWorkflow,
  PrepTaskType,
  AssignmentStatus,
  Teacher,
} from "@/types";

export default function PrepTaskDetailPage() {
  const { id: taskId } = useParams<{ id: string }>();
  const { teacher } = useAuthStore();
  const [task, setTask] = useState<PrepTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showAddWorkflowModal, setShowAddWorkflowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditWorkflowModal, setShowEditWorkflowModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<PrepWorkflow | null>(null);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [workflowForm, setWorkflowForm] = useState({
    type: "paper" as PrepTaskType,
    name: "",
    description: "",
  });
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, teacherList] = await Promise.all([
        prepService.getTask(taskId!),
        organizationService.listTeachers(teacher!.schoolId!),
      ]);
      setTask(taskData);
      setTeachers(teacherList);
    } catch (error) {
      toast.error("加载失败", "任务详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [taskId, teacher]);

  useEffect(() => {
    if (!taskId || !teacher) return;
    loadData();
  }, [loadData, taskId, teacher]);

  const getTeacherName = (id: string) => {
    const t = teachers.find((t) => t.id === id);
    return t ? t.name : "未知教师";
  };

  const getTeacherById = (id: string) => {
    return teachers.find((t) => t.id === id);
  };

  const getWorkflowAssignments = (workflowId: string) => {
    return task?.assignments.filter((a) => a.workflowId === workflowId) || [];
  };

  const getProgress = () => {
    if (!task || task.workflows.length === 0) return 0;
    const completed = task.workflows.filter((w) => w.status === "completed").length;
    return Math.round((completed / task.workflows.length) * 100);
  };

  const getWorkflowProgress = (workflow: PrepWorkflow) => {
    const assignments = getWorkflowAssignments(workflow.id);
    if (assignments.length === 0) return 0;
    const completed = assignments.filter((a) => a.status === "completed").length;
    return Math.round((completed / assignments.length) * 100);
  };

  const handleAddWorkflow = async () => {
    if (!taskId || !workflowForm.name.trim()) {
      toast.warning("提示", "请填写流程名称");
      return;
    }
    setActionLoading(true);
    try {
      await prepService.addWorkflow(taskId, {
        type: workflowForm.type,
        name: workflowForm.name,
        description: workflowForm.description,
      });
      await loadData();
      setShowAddWorkflowModal(false);
      setWorkflowForm({ type: "paper", name: "", description: "" });
      toast.success("成功", "流程添加成功");
    } catch (error) {
      toast.error("失败", "流程添加失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditWorkflow = async () => {
    if (!taskId || !selectedWorkflow || !workflowForm.name.trim()) {
      toast.warning("提示", "请填写流程名称");
      return;
    }
    setActionLoading(true);
    try {
      await prepService.updateWorkflow(taskId, selectedWorkflow.id, {
        type: workflowForm.type,
        name: workflowForm.name,
        description: workflowForm.description,
      });
      await loadData();
      setShowEditWorkflowModal(false);
      setSelectedWorkflow(null);
      setWorkflowForm({ type: "paper", name: "", description: "" });
      toast.success("成功", "流程更新成功");
    } catch (error) {
      toast.error("失败", "流程更新失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!window.confirm("确定要删除这个流程吗？")) return;
    setActionLoading(true);
    try {
      await prepService.deleteWorkflow(taskId!, workflowId);
      await loadData();
      toast.success("成功", "流程删除成功");
    } catch (error) {
      toast.error("失败", "流程删除失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignTask = async () => {
    if (!taskId || !selectedWorkflow || selectedTeacherIds.length === 0) {
      toast.warning("提示", "请选择教师");
      return;
    }
    setActionLoading(true);
    try {
      await prepService.assignTask(taskId, selectedWorkflow.id, selectedTeacherIds);
      await loadData();
      setShowAssignModal(false);
      setSelectedWorkflow(null);
      setSelectedTeacherIds([]);
      toast.success("成功", "任务分配成功");
    } catch (error) {
      toast.error("失败", "任务分配失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateAssignment = async (assignmentId: string, status: AssignmentStatus) => {
    setActionLoading(true);
    try {
      await prepService.updateAssignment(taskId!, assignmentId, status);
      await loadData();
      toast.success("成功", "状态更新成功");
    } catch (error) {
      toast.error("失败", "状态更新失败");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (workflow: PrepWorkflow) => {
    setSelectedWorkflow(workflow);
    setWorkflowForm({
      type: workflow.type,
      name: workflow.name,
      description: workflow.description || "",
    });
    setShowEditWorkflowModal(true);
  };

  const openAssignModal = (workflow: PrepWorkflow) => {
    setSelectedWorkflow(workflow);
    setSelectedTeacherIds([...workflow.assigneeIds]);
    setShowAssignModal(true);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "green";
      case "in_progress":
        return "gold";
      case "pending":
        return "amber";
      case "accepted":
        return "teal";
      case "rejected":
        return "red";
      default:
        return "ink";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4" />;
      case "in_progress":
        return <Clock className="w-4 h-4" />;
      case "pending":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (!teacher) return null;

  if (loading || !task) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  const canManage =
    task.createdBy === teacher.id ||
    teacher.roles.includes("prepLeader") ||
    teacher.roles.includes("subjectLeader") ||
    teacher.roles.includes("dean") ||
    teacher.roles.includes("vicePrincipal") ||
    teacher.roles.includes("principal");

  return (
    <div>
      <PageHeader
        title={task.title}
        description={task.description || "暂无描述"}
        icon={<BookOpen className="w-5 h-5" />}
        action={
          canManage ? (
            <Button variant="gold" onClick={() => setShowAddWorkflowModal(true)}>
              <Plus className="w-4 h-4" />
              添加流程
            </Button>
          ) : null
        }
      />

      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="gold">{task.subject}</Badge>
                <Badge variant="ink">{task.grade}</Badge>
                <Badge variant={getStatusBadgeVariant(task.status)}>
                  {getStatusIcon(task.status)}
                  {taskStatusLabels[task.status]}
                </Badge>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-ink-600">整体进度</span>
                <span className="text-sm font-semibold text-ink-900">{getProgress()}%</span>
              </div>
              <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold-400 to-gold-600 rounded-full transition-all duration-500"
                  style={{ width: `${getProgress()}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-mist">
                <div className="flex items-center gap-2 text-ink-500 text-xs mb-1">
                  <User className="w-3.5 h-3.5" />
                  创建人
                </div>
                <div className="text-sm font-medium text-ink-900">
                  {getTeacherName(task.createdBy)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-mist">
                <div className="flex items-center gap-2 text-ink-500 text-xs mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  创建时间
                </div>
                <div className="text-sm font-medium text-ink-900">
                  {new Date(task.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-mist">
                <div className="flex items-center gap-2 text-ink-500 text-xs mb-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  流程数量
                </div>
                <div className="text-sm font-medium text-ink-900">{task.workflows.length}</div>
              </div>
              <div className="p-3 rounded-lg bg-mist">
                <div className="flex items-center gap-2 text-ink-500 text-xs mb-1">
                  <Users className="w-3.5 h-3.5" />
                  参与教师
                </div>
                <div className="text-sm font-medium text-ink-900">
                  {new Set(task.assignments.map((a) => a.teacherId)).size}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="任务流程" />
          <div className="p-4 space-y-4">
            {task.workflows.length > 0 ? (
              task.workflows
                .sort((a, b) => a.order - b.order)
                .map((workflow, index) => {
                  const assignments = getWorkflowAssignments(workflow.id);
                  const progress = getWorkflowProgress(workflow);
                  const isAssignee = workflow.assigneeIds.includes(teacher.id);
                  const myAssignment = assignments.find((a) => a.teacherId === teacher.id);

                  return (
                    <div
                      key={workflow.id}
                      className={cn(
                        "border rounded-lg p-4 transition-colors",
                        isAssignee ? "border-gold-200 bg-gold-50/30" : "border-ink-100 hover:border-ink-200",
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-ink-800 text-white flex items-center justify-center font-serif font-bold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="gold">{taskTypeLabels[workflow.type]}</Badge>
                              <span className="font-medium text-ink-900">{workflow.name}</span>
                              <Badge variant={getStatusBadgeVariant(workflow.status)}>
                                {getStatusIcon(workflow.status)}
                                {taskStatusLabels[workflow.status]}
                              </Badge>
                            </div>
                            {workflow.description && (
                              <p className="text-sm text-ink-500 mt-1">{workflow.description}</p>
                            )}
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(workflow)}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteWorkflow(workflow.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-ink-500">完成进度</span>
                          <span className="text-xs font-medium text-ink-900">{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              progress === 100
                                ? "bg-emerald-500"
                                : progress > 0
                                  ? "bg-gold-500"
                                  : "bg-transparent",
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-ink-400" />
                          <div className="flex items-center gap-1 flex-wrap">
                            {assignments.length > 0 ? (
                              assignments.map((assignment) => {
                                const t = getTeacherById(assignment.teacherId);
                                const isMe = assignment.teacherId === teacher.id;
                                return (
                                  <div
                                    key={assignment.id}
                                    className={cn(
                                      "flex items-center gap-1 px-2 py-1 rounded-full text-xs",
                                      isMe
                                        ? "bg-gold-100 text-gold-800"
                                        : "bg-ink-100 text-ink-600",
                                    )}
                                  >
                                    {t?.name || "未知"}
                                    <Badge
                                      variant={getStatusBadgeVariant(assignment.status)}
                                      className="ml-1"
                                    >
                                      {assignmentStatusLabels[assignment.status]}
                                    </Badge>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-xs text-ink-400">暂无分配</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {myAssignment && (
                            <div className="flex items-center gap-2">
                              {myAssignment.status === "pending" && (
                                <Button
                                  variant="gold"
                                  size="sm"
                                  onClick={() =>
                                    handleUpdateAssignment(myAssignment.id, "accepted")
                                  }
                                  loading={actionLoading}
                                >
                                  认领任务
                                </Button>
                              )}
                              {myAssignment.status === "accepted" && (
                                <Button
                                  variant="gold"
                                  size="sm"
                                  onClick={() =>
                                    handleUpdateAssignment(myAssignment.id, "in_progress")
                                  }
                                  loading={actionLoading}
                                >
                                  开始执行
                                </Button>
                              )}
                              {myAssignment.status === "in_progress" && (
                                <Button
                                  variant="gold"
                                  size="sm"
                                  onClick={() =>
                                    handleUpdateAssignment(myAssignment.id, "completed")
                                  }
                                  loading={actionLoading}
                                >
                                  完成任务
                                </Button>
                              )}
                            </div>
                          )}
                          {canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAssignModal(workflow)}
                            >
                              分配任务
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-ink-200 mx-auto mb-3" />
                <p className="text-ink-400 mb-4">暂无任务流程</p>
                {canManage && (
                  <Button variant="gold" onClick={() => setShowAddWorkflowModal(true)}>
                    <Plus className="w-4 h-4" />
                    添加流程
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={showAddWorkflowModal}
        onClose={() => setShowAddWorkflowModal(false)}
        title="添加流程"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAddWorkflowModal(false)}>
              取消
            </Button>
            <Button variant="gold" onClick={handleAddWorkflow} loading={actionLoading}>
              添加
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">流程类型</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(taskTypeLabels) as PrepTaskType[]).map((type) => (
                <button
                  key={type}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    workflowForm.type === type
                      ? "bg-gold-500 text-white"
                      : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                  )}
                  onClick={() => setWorkflowForm({ ...workflowForm, type })}
                >
                  {taskTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">流程名称</label>
            <Input
              value={workflowForm.name}
              onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
              placeholder="请输入流程名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">描述</label>
            <textarea
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              rows={3}
              value={workflowForm.description}
              onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })}
              placeholder="请输入流程描述（可选）"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showEditWorkflowModal}
        onClose={() => {
          setShowEditWorkflowModal(false);
          setSelectedWorkflow(null);
        }}
        title="编辑流程"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditWorkflowModal(false);
                setSelectedWorkflow(null);
              }}
            >
              取消
            </Button>
            <Button variant="gold" onClick={handleEditWorkflow} loading={actionLoading}>
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">流程类型</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(taskTypeLabels) as PrepTaskType[]).map((type) => (
                <button
                  key={type}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    workflowForm.type === type
                      ? "bg-gold-500 text-white"
                      : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                  )}
                  onClick={() => setWorkflowForm({ ...workflowForm, type })}
                >
                  {taskTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">流程名称</label>
            <Input
              value={workflowForm.name}
              onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
              placeholder="请输入流程名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">描述</label>
            <textarea
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              rows={3}
              value={workflowForm.description}
              onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })}
              placeholder="请输入流程描述（可选）"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showAssignModal}
        onClose={() => {
          setShowAssignModal(false);
          setSelectedWorkflow(null);
          setSelectedTeacherIds([]);
        }}
        title={`分配任务：${selectedWorkflow?.name}`}
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAssignModal(false);
                setSelectedWorkflow(null);
                setSelectedTeacherIds([]);
              }}
            >
              取消
            </Button>
            <Button variant="gold" onClick={handleAssignTask} loading={actionLoading}>
              确认分配
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            已选择 {selectedTeacherIds.length} 位教师
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {teachers.map((t) => (
              <label
                key={t.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                  selectedTeacherIds.includes(t.id)
                    ? "bg-gold-50 border border-gold-200"
                    : "hover:bg-mist border border-transparent",
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedTeacherIds.includes(t.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTeacherIds([...selectedTeacherIds, t.id]);
                    } else {
                      setSelectedTeacherIds(
                        selectedTeacherIds.filter((id) => id !== t.id),
                      );
                    }
                  }}
                  className="w-4 h-4 rounded border-ink-300 text-gold-600 focus:ring-gold-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-900">{t.name}</span>
                    <Badge variant="ink">{t.subject}</Badge>
                  </div>
                  <div className="text-xs text-ink-500">工号：{t.employeeNo || "未填写"}</div>
                </div>
                {selectedTeacherIds.includes(t.id) && (
                  <ChevronRight className="w-4 h-4 text-gold-600" />
                )}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
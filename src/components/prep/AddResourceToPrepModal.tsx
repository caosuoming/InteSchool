import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, LockKeyhole, Users } from "lucide-react";
import { organizationService } from "@/services/organization";
import { prepService } from "@/services/prep";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type { PrepSubmissionResourceType, PrepTask, Teacher } from "@/types";

interface AddResourceToPrepModalProps {
  open: boolean;
  onClose: () => void;
  resourceType: PrepSubmissionResourceType;
  resourceId: string;
  resourceTitle: string;
  onCreated?: (task: PrepTask) => void;
}

export function AddResourceToPrepModal({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
  onCreated,
}: AddResourceToPrepModalProps) {
  const { teacher } = useAuthStore();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [passwordExpiresAt, setPasswordExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !teacher?.schoolId) return;
    setSelectedIds([]);
    setPassword("");
    setPasswordExpiresAt("");
    setLoading(true);
    organizationService
      .listTeachers(teacher.schoolId)
      .then((items) => setTeachers(items.filter((item) => item.id !== teacher.id)))
      .catch(() => toast.error("加载失败", "协作教师列表暂时无法加载"))
      .finally(() => setLoading(false));
  }, [open, teacher?.id, teacher?.schoolId]);

  const selectedNames = useMemo(
    () => teachers.filter((item) => selectedIds.includes(item.id)).map((item) => item.name),
    [selectedIds, teachers],
  );

  const toggleTeacher = (teacherId: string) => {
    setSelectedIds((current) =>
      current.includes(teacherId)
        ? current.filter((id) => id !== teacherId)
        : [...current, teacherId],
    );
  };

  const handleCreate = async () => {
    if (selectedIds.length === 0) {
      toast.warning("请至少选择一位协作教师");
      return;
    }
    if (passwordExpiresAt && !password.trim()) {
      toast.warning("设置失效时间前请先填写访问密码");
      return;
    }
    setSaving(true);
    try {
      const task = await prepService.createResourceTask({
        resourceType,
        resourceId,
        collaboratorIds: selectedIds,
        password: password.trim() || undefined,
        passwordExpiresAt: passwordExpiresAt || undefined,
      });
      toast.success("已添加到集体备课", `${selectedNames.join("、")} 已收到协作待办`);
      onCreated?.(task);
      onClose();
    } catch (error) {
      toast.error("添加失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加到集体备课"
      description={`协作编辑：${resourceTitle}`}
      size="lg"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="gold" loading={saving} onClick={() => void handleCreate()}>
            <Users className="h-4 w-4" />
            创建协作待办
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
            <Users className="h-4 w-4 text-gold-600" />
            选择协作对象
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Spinner size={22} /></div>
          ) : teachers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
              当前学校暂无其他可选教师
            </div>
          ) : (
            <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
              {teachers.map((item) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleTeacher(item.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-gold-400 bg-gold-50"
                        : "border-ink-100 bg-paper hover:border-gold-200",
                    )}
                  >
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border",
                      selected ? "border-gold-500 bg-gold-500 text-white" : "border-ink-200",
                    )}>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">{item.name}</span>
                      <span className="block truncate text-xs text-ink-400">
                        {item.subject || "未设置学科"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-ink-100 bg-mist/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-800">
            <LockKeyhole className="h-4 w-4 text-ink-500" />
            查看保护（可选）
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="访问密码"
              type="password"
              value={password}
              maxLength={128}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="留空表示无需密码"
            />
            <Input
              label="密码失效时间"
              type="datetime-local"
              value={passwordExpiresAt}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              onChange={(event) => setPasswordExpiresAt(event.target.value)}
              disabled={!password.trim()}
              hint="到期后协作者需联系创建人更新密码"
            />
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            密码只用于协作者打开和保存文档；创建人始终可以管理该协作任务。
          </div>
        </section>
      </div>
    </Modal>
  );
}

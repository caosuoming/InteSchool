import { useCallback, useEffect, useState } from "react";
import { BookOpen, Building2, FileText, ShieldCheck, UserPlus } from "lucide-react";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { SchoolApplication } from "@/types";

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="text-sm text-ink-700 mt-0.5">{value}</div>
    </div>
  );
}

export default function TeacherSchoolApplicationsPage() {
  const teacher = useAuthStore((state) => state.teacher);
  const [applications, setApplications] = useState<SchoolApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    try {
      setApplications(await authService.getPendingApplications(teacher.schoolId || ""));
    } catch (error) {
      toast.error("加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, approved: boolean) => {
    setReviewing(id);
    try {
      await authService.reviewApplication(id, approved);
      toast.success(approved ? "教师入校申请已通过" : "教师入校申请已拒绝");
      await load();
    } catch (error) {
      toast.error("审核失败", error instanceof Error ? error.message : undefined);
    } finally {
      setReviewing(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="教师入校审核"
        description="学校管理员可审核本校申请，平台超级管理员可审核所有学校申请"
        icon={<UserPlus className="w-5 h-5" />}
      />

      {loading ? (
        <Card className="py-16 flex items-center justify-center gap-2 text-sm text-ink-500">
          <Spinner />
          加载申请中...
        </Card>
      ) : applications.length === 0 ? (
        <Card>
          <EmptyState icon={<UserPlus className="w-7 h-7" />} title="暂无待审核的教师入校申请" />
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((application) => (
            <Card key={application.id} className="p-5">
              <div className="flex flex-col xl:flex-row xl:items-start gap-5">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif font-semibold text-ink-900">
                      {application.teacherName || "未知教师"}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-1 text-xs text-ink-600">
                      <Building2 className="w-3 h-3" />
                      {application.schoolName || application.schoolId}
                    </span>
                    {application.requestSchoolAdmin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2 py-1 text-xs text-gold-700">
                        <ShieldCheck className="w-3 h-3" />
                        申请学校管理员
                      </span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    <Detail
                      label="任教学科"
                      value={(application.subjects?.length ? application.subjects : [application.subject]).join("、")}
                    />
                    <Detail label="任教年级" value={application.teachingGrades?.join("、")} />
                    <Detail label="工号" value={application.employeeNo} />
                    <Detail label="职务" value={application.position} />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-ink-400">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      提交于 {new Date(application.createdAt).toLocaleString("zh-CN")}
                    </span>
                    {application.proofFileId ? (
                      <a
                        href={`/api/files/${encodeURIComponent(application.proofFileId)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-gold-700 hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        查看证明材料{application.proofFileName ? `：${application.proofFileName}` : ""}
                      </a>
                    ) : (
                      <span>未提交证明材料</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    disabled={reviewing !== null}
                    loading={reviewing === application.id}
                    onClick={() => review(application.id, false)}
                  >
                    拒绝
                  </Button>
                  <Button
                    variant="gold"
                    disabled={reviewing !== null}
                    loading={reviewing === application.id}
                    onClick={() => review(application.id, true)}
                  >
                    通过
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

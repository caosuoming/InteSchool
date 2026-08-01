import { useEffect, useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { schoolService } from "@/services/school";
import { toast } from "@/stores/ui";
import type { SchoolCreationApplication } from "@/types";

export default function SchoolCreationApplicationsPage() {
  const [applications, setApplications] = useState<SchoolCreationApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setApplications(await schoolService.listPendingSchoolCreationApplications());
    } catch (error) {
      toast.error("加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const review = async (id: string, approved: boolean) => {
    setReviewing(id);
    try {
      await schoolService.reviewSchoolCreationApplication(id, approved);
      toast.success(approved ? "学校已创建" : "申请已拒绝");
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
        title="新增学校审核"
        description="审核用户提交的新学校申请；通过后学校会立即进入可搜索列表"
        icon={<Building2 className="w-5 h-5" />}
      />

      {loading ? (
        <Card className="py-16 flex items-center justify-center gap-2 text-sm text-ink-500">
          <Spinner />
          加载申请中...
        </Card>
      ) : applications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="w-7 h-7" />}
            title="暂无待审核的新学校申请"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((application) => (
            <Card key={application.id} className="p-5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-5">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif font-semibold text-ink-900">{application.name}</h3>
                    <span className="text-xs rounded-full bg-ink-100 text-ink-600 px-2 py-1">
                      {application.code}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-ink-500 mt-2">
                    <MapPin className="w-4 h-4" />
                    {application.city}
                  </div>
                  <p className="text-sm text-ink-600 mt-2 whitespace-pre-wrap">
                    {application.description}
                  </p>
                  <div className="text-xs text-ink-400 mt-3">
                    申请人：{application.requesterName} · 提交于 {new Date(application.createdAt).toLocaleString("zh-CN")}
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
                    通过并创建
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

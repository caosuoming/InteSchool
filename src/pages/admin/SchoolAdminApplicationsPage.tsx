import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { authService } from "@/services/auth";
import { toast } from "@/stores/ui";
import type { SchoolAdminApplication } from "@/types";

export default function SchoolAdminApplicationsPage() {
  const [applications, setApplications] = useState<SchoolAdminApplication[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const load = async () => setApplications(await authService.getPendingSchoolAdminApplications());
  useEffect(() => { void load(); }, []);
  const review = async (id: string, approved: boolean) => {
    setReviewing(id);
    try {
      await authService.reviewSchoolAdminApplication(id, approved);
      toast.success(approved ? "已授予学校管理员权限" : "申请已拒绝");
      await load();
    } catch (error) { toast.error("审核失败", error instanceof Error ? error.message : undefined); }
    finally { setReviewing(null); }
  };
  return <div><PageHeader title="学校管理员审核" description="仅平台管理员可审核学校管理员权限申请" icon={<ShieldCheck className="w-5 h-5" />} />{applications.length === 0 ? <Card><EmptyState icon={<ShieldCheck className="w-7 h-7" />} title="暂无待审核申请" /></Card> : <div className="space-y-3">{applications.map((item) => <Card key={item.id} className="p-5"><div className="flex flex-col md:flex-row md:items-center gap-4"><div className="flex-1"><div className="font-medium text-ink-900">{item.teacherName} · {item.schoolName}</div><div className="text-sm text-ink-600 mt-1">{item.reason}</div><div className="text-xs text-ink-400 mt-2">提交于 {new Date(item.createdAt).toLocaleString("zh-CN")}</div></div><div className="flex gap-2"><Button variant="outline" loading={reviewing === item.id} onClick={() => review(item.id, false)}>拒绝</Button><Button variant="gold" loading={reviewing === item.id} onClick={() => review(item.id, true)}>通过</Button></div></div></Card>)}</div>}</div>;
}

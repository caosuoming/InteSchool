import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Share2 } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { shareService } from "@/services/share";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { ShareRecord, ShareableResourceType } from "@/types";

const resourceTypeLabels: Record<ShareableResourceType, string> = {
  question: "题目",
  examPaper: "试卷",
  lecture: "讲义",
  courseware: "课件",
  material: "素材",
};

function isExpired(record: ShareRecord): boolean {
  return Boolean(record.expiresAt && new Date(record.expiresAt) <= new Date());
}

export default function BatchSharePage() {
  const { batchId = "" } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const [records, setRecords] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadBatch = useCallback(async () => {
    if (!batchId) {
      setLoadError("分享链接不完整");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      setRecords(await shareService.getBatchShare(batchId));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法加载分享资源");
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  const availableRecords = useMemo(
    () => records.filter((record) => record.status === "pending" && !isExpired(record)),
    [records],
  );
  const createdByCurrentTeacher = Boolean(
    teacher && records.length > 0 && records.every((record) => record.fromTeacherId === teacher.id),
  );

  const handleAcceptAll = async () => {
    if (!teacher?.schoolId || availableRecords.length === 0) return;
    setAccepting(true);
    try {
      const results = await Promise.allSettled(availableRecords.map((record) =>
        shareService.acceptShare(record.id, teacher.id, teacher.schoolId!),
      ));
      const succeededCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - succeededCount;

      if (succeededCount > 0) {
        toast.success("资源已导入", `已将 ${succeededCount} 个资源保存到“我的资源”`);
      }
      if (failedCount > 0) {
        toast.error("部分资源导入失败", `${failedCount} 个资源未能导入`);
        await loadBatch();
      } else if (succeededCount > 0) {
        navigate("/my-resources");
      }
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="批量分享资源"
        description="查看分享内容并将仍有效的资源导入到自己的资源库"
        icon={<Share2 className="h-5 w-5" />}
        action={
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        }
      />

      <div className="mx-auto max-w-4xl">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={24} /></div>
        ) : loadError ? (
          <Card>
            <EmptyState
              icon={<Share2 className="h-7 w-7" />}
              title="分享链接无法打开"
              description={loadError}
            />
          </Card>
        ) : records.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Share2 className="h-7 w-7" />}
              title="分享内容不存在"
              description="链接可能无效，或分享记录已被删除。"
            />
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-ink-900">共 {records.length} 个资源</div>
                  <div className="mt-1 text-sm text-ink-500">
                    {availableRecords.length > 0
                      ? `${availableRecords.length} 个资源当前可导入`
                      : "该分享中的资源已被接收或失效"}
                  </div>
                </div>
                {createdByCurrentTeacher ? (
                  <Badge variant="amber">这是你创建的分享链接</Badge>
                ) : (
                  <Button
                    variant="gold"
                    onClick={handleAcceptAll}
                    loading={accepting}
                    disabled={availableRecords.length === 0}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    导入全部可用资源
                  </Button>
                )}
              </div>
            </Card>

            <div className="space-y-2">
              {records.map((record) => {
                const expired = isExpired(record);
                const available = record.status === "pending" && !expired;
                return (
                  <Card key={record.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="line-clamp-2 font-medium text-ink-900">{record.resourceTitle}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                          <Badge variant="default">{resourceTypeLabels[record.resourceType]}</Badge>
                          <span>{new Date(record.createdAt).toLocaleString("zh-CN")}</span>
                        </div>
                      </div>
                      {available ? (
                        <Badge variant="teal">可导入</Badge>
                      ) : (
                        <Badge variant="default">
                          <Clock3 className="mr-1 h-3 w-3" />
                          {expired ? "已过期" : "已处理"}
                        </Badge>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

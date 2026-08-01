import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ExternalLink, Link2, PlayCircle, Presentation, Save } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { CoursewareEmbed } from "@/components/courseware/CoursewareEmbed";
import { coursewareService } from "@/services/courseware";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { Courseware, CoursewareType } from "@/types";
import { getCoursewareEditorUrl, getCoursewareFileUrl } from "@/lib/courseware-online";

const typeLabel: Record<CoursewareType, string> = {
  ppt: "PPT",
  ggb: "GeoGebra",
  pdf: "PDF",
  video: "视频",
  image: "图片",
  other: "其他",
};

export default function CoursewarePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const [courseware, setCourseware] = useState<Courseware | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [bindingEditor, setBindingEditor] = useState(false);
  const [editorUrl, setEditorUrl] = useState("");
  const [savingEditor, setSavingEditor] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    coursewareService.getCourseware(id)
      .then((item) => {
        if (!item) throw new Error("课件不存在");
        setCourseware(item);
        setEditorUrl(item.editorUrl || "");
      })
      .catch((error) => {
        toast.error("加载失败", error instanceof Error ? error.message : undefined);
        navigate("/my-resources/coursewares");
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const resolvedEditorUrl = useMemo(
    () => courseware ? getCoursewareEditorUrl(courseware) : undefined,
    [courseware],
  );

  const handleAddToLesson = async () => {
    if (!courseware || !teacher?.schoolId) return;
    setAdding(true);
    try {
      const lesson = await lessonCoursewareService.createFromCourseware(
        teacher.id,
        teacher.schoolId,
        courseware,
      );
      toast.success("已添加到我的上课", "请选择班级并完成发布");
      navigate(`/my-lessons/${lesson.id}/edit`);
    } catch (error) {
      toast.error("添加失败", error instanceof Error ? error.message : undefined);
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEditor = async () => {
    if (!courseware) return;
    const value = editorUrl.trim();
    if (value && !/^https:\/\//i.test(value)) {
      toast.error("请输入 HTTPS 在线编辑地址");
      return;
    }
    setSavingEditor(true);
    try {
      const updated = await coursewareService.updateCourseware(courseware.id, {
        editorUrl: value || undefined,
      });
      setCourseware(updated);
      setBindingEditor(false);
      toast.success(value ? "已绑定在线编辑器" : "已清除在线编辑地址");
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingEditor(false);
    }
  };

  const handleCopySource = async () => {
    if (!courseware) return;
    const sourceUrl = getCoursewareFileUrl(courseware);
    if (!sourceUrl) return;
    await navigator.clipboard.writeText(sourceUrl);
    toast.success("课件文件地址已复制");
  };

  if (loading || !courseware) {
    return <div className="flex justify-center py-24"><Spinner size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => navigate("/my-resources/coursewares")}>
          <ArrowLeft className="w-4 h-4" />返回课件库
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Presentation className="w-5 h-5 text-gold-600" />
            <h1 className="font-serif text-xl font-semibold text-ink-900">{courseware.title}</h1>
            <Badge variant="ink">{typeLabel[courseware.type]}</Badge>
          </div>
          <p className="text-sm text-ink-500 mt-1">{courseware.description || courseware.fileName || "在线课件预览"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBindingEditor(true)}>
            <Link2 className="w-4 h-4" />绑定编辑器
          </Button>
          {resolvedEditorUrl && (
            <Button variant="outline" onClick={() => window.open(resolvedEditorUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="w-4 h-4" />在线编辑
            </Button>
          )}
          <Button variant="gold" onClick={handleAddToLesson} loading={adding}>
            <PlayCircle className="w-4 h-4" />推送到我的上课
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-ink-100 bg-mist/40 flex items-center justify-between gap-3">
          <div className="text-sm text-ink-600">{courseware.fileName || "课件文件"}</div>
          {courseware.type === "ppt" && !resolvedEditorUrl && (
            <span className="text-xs text-amber-700">绑定 WPS 在线文档共享地址后可一键编辑</span>
          )}
        </div>
        <CoursewareEmbed courseware={courseware} title={courseware.title} />
      </Card>

      <Modal
        open={bindingEditor}
        onClose={() => setBindingEditor(false)}
        title="绑定在线编辑器"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBindingEditor(false)}>取消</Button>
            <Button variant="gold" onClick={handleSaveEditor} loading={savingEditor}>
              <Save className="w-4 h-4" />保存
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {courseware.type === "ppt" ? (
            <div className="rounded-lg border border-ink-100 bg-mist/40 p-3 text-sm text-ink-600 space-y-2">
              <p>在 WPS 在线文档中导入该 PPT，再将可编辑共享地址粘贴到下方。系统会在课件库和上课页面保留此入口。</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleCopySource}>复制课件文件地址</Button>
                <Button variant="outline" size="sm" onClick={() => window.open("https://www.kdocs.cn/", "_blank", "noopener,noreferrer")}>
                  打开 WPS 在线文档
                </Button>
              </div>
            </div>
          ) : courseware.type === "ggb" ? (
            <p className="text-sm text-ink-600">GeoGebra 文件已可直接在在线编辑器中打开；也可以绑定一个固定共享地址。</p>
          ) : (
            <p className="text-sm text-ink-600">可绑定支持该文件格式的 HTTPS 在线编辑地址。</p>
          )}
          <Input
            label="在线编辑地址"
            value={editorUrl}
            onChange={(event) => setEditorUrl(event.target.value)}
            placeholder="https://..."
          />
        </div>
      </Modal>
    </div>
  );
}

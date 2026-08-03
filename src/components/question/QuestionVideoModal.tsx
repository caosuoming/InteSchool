import { useEffect, useMemo, useState } from "react";
import { Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { uploadFile } from "@/services/api";
import { materialService } from "@/services/material";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import { isVideoMaterial, looksLikeVideoFile } from "@/lib/material-media";
import type { Material, Question, QuestionVideoReference } from "@/types";

interface QuestionVideoModalProps {
  open: boolean;
  question: Question | null;
  material?: Material | null;
  teacherId?: string;
  schoolId?: string;
  onClose: () => void;
  onSaved?: (question: Question) => void;
  onMaterialSaved?: (material: Material) => void;
}

function looksLikeVideo(file: File): boolean {
  return file.type.startsWith("video/") || looksLikeVideoFile(file.name);
}

function toReference(material: Material): QuestionVideoReference {
  return {
    materialId: material.id,
    title: material.title,
    fileUrl: material.fileUrl,
    content: material.content,
  };
}

export function QuestionVideoModal({
  open,
  question,
  material,
  teacherId,
  schoolId,
  onClose,
  onSaved,
  onMaterialSaved,
}: QuestionVideoModalProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentReference = question?.explanationVideo || material?.explanationVideo || null;

  useEffect(() => {
    if (!open || (!question && !material) || !teacherId || !schoolId) return;
    setSelectedMaterialId(currentReference?.materialId || "");
    setLocalFile(null);
    setLoading(true);
    materialService.listMaterials({ teacherId, schoolId })
      .then((items) => setMaterials(items.filter(isVideoMaterial)))
      .catch((error) => toast.error("视频素材加载失败", error instanceof Error ? error.message : undefined))
      .finally(() => setLoading(false));
  }, [currentReference?.materialId, material, open, question, schoolId, teacherId]);

  const currentMissingReference = useMemo(() => {
    if (!currentReference || !selectedMaterialId) return null;
    return materials.some((item) => item.id === selectedMaterialId)
      ? null
      : currentReference;
  }, [currentReference, materials, selectedMaterialId]);

  const handleSave = async () => {
    if ((!question && !material) || !teacherId || !schoolId) return;
    if (localFile && !looksLikeVideo(localFile)) {
      toast.error("请选择视频文件");
      return;
    }

    setSaving(true);
    try {
      let reference: QuestionVideoReference | null = null;
      if (localFile) {
        const uploaded = await uploadFile(localFile);
        const targetLabel = question ? "题目" : "知识块";
        const targetTitle = question
          ? question.stem.replace(/<[^>]+>/g, "").slice(0, 60)
          : material?.title || "";
        const uploadedMaterial = await materialService.createMaterial(teacherId, schoolId, {
          title: localFile.name,
          description: `${targetLabel}讲解视频：${targetTitle}`,
          chapterIds: [...(question?.chapterIds || material?.chapterIds || [])],
          knowledgePointIds: [...(question?.knowledgePointIds || material?.knowledgePointIds || [])],
          grade: question?.grade || material?.grade || "",
          schoolYear: question?.schoolYear || material?.schoolYear || "",
          semester: question?.semester || material?.semester,
          type: "video",
          content: localFile.name,
          fileUrl: uploaded.url,
          fileSize: localFile.size,
          tags: [`${targetLabel}讲解`],
        });
        reference = toReference(uploadedMaterial);
      } else if (selectedMaterialId) {
        const selected = materials.find((item) => item.id === selectedMaterialId);
        reference = selected ? toReference(selected) : currentMissingReference;
      }

      if (question) {
        const updated = await questionService.updateQuestion(question.id, {
          explanationVideo: reference,
        });
        onSaved?.(updated);
      } else if (material) {
        const updated = await materialService.updateMaterial(material.id, {
          explanationVideo: reference,
        });
        onMaterialSaved?.(updated);
      }
      toast.success(reference ? "讲解视频已关联" : "讲解视频已移除");
    } catch (error) {
      toast.error("讲解视频保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="讲解视频"
      description="可选择素材库中的视频，或上传本地视频；本地视频会自动保存到素材库。"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="gold" onClick={handleSave} loading={saving} disabled={!teacherId || !schoolId}>
            <Video className="h-4 w-4" />
            保存讲解视频
          </Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="question-video-material"
            className="mb-1.5 block text-sm font-medium text-ink-700"
          >
            从素材库选择
          </label>
          <select
            id="question-video-material"
            value={localFile ? "" : selectedMaterialId}
            onChange={(event) => {
              setSelectedMaterialId(event.target.value);
              setLocalFile(null);
            }}
            className="input-base w-full"
            disabled={loading}
          >
            <option value="">不关联讲解视频</option>
            {currentMissingReference && (
              <option value={currentMissingReference.materialId}>
                {currentMissingReference.title}（素材已删除，保留现有引用）
              </option>
            )}
            {materials.map((material) => (
              <option key={material.id} value={material.id}>{material.title}</option>
            ))}
          </select>
          <div className="mt-1 text-xs text-ink-400">
            {loading ? "正在加载视频素材..." : `素材库中共 ${materials.length} 个视频`}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-ink-100" />
          <span className="text-xs text-ink-400">或</span>
          <div className="h-px flex-1 bg-ink-100" />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/30 p-4 hover:bg-violet-50">
          <div className="rounded-full bg-violet-100 p-2 text-violet-700">
            <Upload className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink-800">上传本地视频</div>
            <div className="truncate text-xs text-ink-400">
              {localFile ? `${localFile.name} · ${(localFile.size / 1024 / 1024).toFixed(1)} MB` : "选择后将在保存时上传并加入素材库"}
            </div>
          </div>
          <input
            type="file"
            accept="video/*,.mp4,.webm,.ogg,.mov,.m4v"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setLocalFile(file);
              if (file) setSelectedMaterialId("");
            }}
          />
        </label>
      </div>
    </Modal>
  );
}

export default QuestionVideoModal;

import { useCallback, useState, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Settings,
  Plus,
  Edit3,
  Trash2,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuthStore } from "@/stores/auth";
import { settingsService } from "@/services/settings";
import type { SchoolSetting, ClassTypeCategory, ExamPaperType, LectureType } from "@/types";
import { cn } from "@/lib/utils";
import { orderedResourceTypes, siblingTypes } from "@/lib/resource-type-hierarchy";
import { toast } from "@/stores/ui";

type SettingTab = "grade" | "schoolYear" | "source" | "questionType" | "category" | "classType" | "examPaperType" | "lectureType";

const tabConfig: { key: SettingTab; label: string; description: string }[] = [
  { key: "grade", label: "年级", description: "管理学校的年级设置，拖拽可调整排序" },
  { key: "schoolYear", label: "学年", description: "管理学年设置，拖拽可调整排序" },
  { key: "source", label: "来源", description: "管理题目来源类型，拖拽可调整排序" },
  { key: "questionType", label: "题型", description: "管理题目类型，拖拽可调整排序" },
  { key: "category", label: "分类", description: "管理题目分类（练习/考试/作业/复习），拖拽可调整排序" },
  { key: "classType", label: "班型", description: "管理班级类型（如强基班、实验班、普通班等），拖拽可调整排序" },
  { key: "examPaperType", label: "试卷类型", description: "管理一级、二级试卷类型；同级类型可拖拽或使用箭头调整排序" },
  { key: "lectureType", label: "讲义类型", description: "管理一级、二级讲义类型；同级类型可拖拽或使用箭头调整排序" },
];

interface FormData {
  name: string;
  value: string;
  sortOrder: string;
  enabled: boolean;
}

const initialFormData: FormData = {
  name: "",
  value: "",
  sortOrder: "",
  enabled: true,
};

interface ClassTypeFormData {
  name: string;
  description: string;
  color: string;
  sortOrder: string;
  enabled: boolean;
}

const initialClassTypeFormData: ClassTypeFormData = {
  name: "",
  description: "",
  color: "#6b7280",
  sortOrder: "",
  enabled: true,
};

interface ExamPaperTypeFormData {
  name: string;
  description: string;
  parentId: string;
  format: "simple" | "gaokao";
  sortOrder: string;
  enabled: boolean;
}

const initialExamPaperTypeFormData: ExamPaperTypeFormData = {
  name: "",
  description: "",
  parentId: "",
  format: "simple",
  sortOrder: "",
  enabled: true,
};

interface LectureTypeFormData {
  name: string;
  description: string;
  parentId: string;
  format: "table" | "mixed";
  sortOrder: string;
  enabled: boolean;
}

const initialLectureTypeFormData: LectureTypeFormData = {
  name: "",
  description: "",
  parentId: "",
  format: "table",
  sortOrder: "",
  enabled: true,
};

interface SortableItemProps {
  item: SchoolSetting;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (item: SchoolSetting) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

function SortableSettingItem({ item, isFirst, isLast, onEdit, onDelete, onToggle, onMoveUp, onMoveDown }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-4 py-3 first:pt-0 last:pb-0 bg-paper",
        isDragging && "shadow-lg rounded-lg border border-gold-300",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-ink-300 cursor-grab active:cursor-grabbing hover:text-gold-500 transition-colors"
        title="拖拽排序"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      {/* 上下箭头排序 */}
      <div className="flex-shrink-0 flex flex-col gap-0.5">
        <button
          onClick={() => onMoveUp(item.id)}
          disabled={isFirst}
          className={cn(
            "p-0.5 rounded transition-colors",
            isFirst
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="上移"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMoveDown(item.id)}
          disabled={isLast}
          className={cn(
            "p-0.5 rounded transition-colors",
            isLast
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="下移"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-900">{item.name}</span>
          <Badge variant="ink" className="text-xs">
            {item.value}
          </Badge>
        </div>
        <div className="text-xs text-ink-400 mt-1">
          排序：{item.sortOrder}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={item.enabled ? "green" : "default"}>
          {item.enabled ? "已启用" : "已禁用"}
        </Badge>

        <button
          onClick={() => onToggle(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title={item.enabled ? "禁用" : "启用"}
        >
          {item.enabled ? (
            <ToggleRight className="w-5 h-5 text-green-600" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
        </button>

        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title="编辑"
        >
          <Edit3 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface ClassTypeItemProps {
  item: ClassTypeCategory;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (item: ClassTypeCategory) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

function SortableClassTypeItem({ item, isFirst, isLast, onEdit, onDelete, onToggle, onMoveUp, onMoveDown }: ClassTypeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-4 py-3 first:pt-0 last:pb-0 bg-paper",
        isDragging && "shadow-lg rounded-lg border border-gold-300",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-ink-300 cursor-grab active:cursor-grabbing hover:text-gold-500 transition-colors"
        title="拖拽排序"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      {/* 上下箭头排序 */}
      <div className="flex-shrink-0 flex flex-col gap-0.5">
        <button
          onClick={() => onMoveUp(item.id)}
          disabled={isFirst}
          className={cn(
            "p-0.5 rounded transition-colors",
            isFirst
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="上移"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMoveDown(item.id)}
          disabled={isLast}
          className={cn(
            "p-0.5 rounded transition-colors",
            isLast
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="下移"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: item.color || "#6b7280" }}
          />
          <span className="font-medium text-ink-900">{item.name}</span>
        </div>
        <div className="text-xs text-ink-400 mt-1">
          {item.description || "暂无描述"} · 排序：{item.sortOrder}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={item.enabled ? "green" : "default"}>
          {item.enabled ? "已启用" : "已禁用"}
        </Badge>

        <button
          onClick={() => onToggle(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title={item.enabled ? "禁用" : "启用"}
        >
          {item.enabled ? (
            <ToggleRight className="w-5 h-5 text-green-600" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
        </button>

        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title="编辑"
        >
          <Edit3 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface ExamPaperTypeItemProps {
  item: ExamPaperType;
  parentName?: string;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (item: ExamPaperType) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

function SortableExamPaperTypeItem({ item, parentName, isFirst, isLast, onEdit, onDelete, onToggle, onMoveUp, onMoveDown }: ExamPaperTypeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  const formatLabel = item.format === "gaokao" ? "高考格式" : "简易格式";
  const formatColor = item.format === "gaokao" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-4 py-3 first:pt-0 last:pb-0 bg-paper",
        parentName && "pl-8",
        isDragging && "shadow-lg rounded-lg border border-gold-300",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-ink-300 cursor-grab active:cursor-grabbing hover:text-gold-500 transition-colors"
        title="拖拽排序"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      <div className="flex-shrink-0 flex flex-col gap-0.5">
        <button
          onClick={() => onMoveUp(item.id)}
          disabled={isFirst}
          className={cn(
            "p-0.5 rounded transition-colors",
            isFirst
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="上移"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMoveDown(item.id)}
          disabled={isLast}
          className={cn(
            "p-0.5 rounded transition-colors",
            isLast
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="下移"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-900">{item.name}</span>
          <Badge variant={parentName ? "teal" : "default"} className="text-xs">
            {parentName ? "二级" : "一级"}
          </Badge>
          <Badge className={cn("text-xs", formatColor)}>
            {formatLabel}
          </Badge>
        </div>
        <div className="text-xs text-ink-400 mt-1">
          {parentName ? `上级：${parentName} · ` : ""}{item.description || "暂无描述"} · 排序：{item.sortOrder}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={item.enabled ? "green" : "default"}>
          {item.enabled ? "已启用" : "已禁用"}
        </Badge>

        <button
          onClick={() => onToggle(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title={item.enabled ? "禁用" : "启用"}
        >
          {item.enabled ? (
            <ToggleRight className="w-5 h-5 text-green-600" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
        </button>

        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title="编辑"
        >
          <Edit3 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface LectureTypeItemProps {
  item: LectureType;
  parentName?: string;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (item: LectureType) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

function SortableLectureTypeItem({ item, parentName, isFirst, isLast, onEdit, onDelete, onToggle, onMoveUp, onMoveDown }: LectureTypeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  const formatLabel = item.format === "table" ? "表格形式" : "混合结构";
  const formatColor = item.format === "table" ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-4 py-3 first:pt-0 last:pb-0 bg-paper",
        parentName && "pl-8",
        isDragging && "shadow-lg rounded-lg border border-gold-300",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-ink-300 cursor-grab active:cursor-grabbing hover:text-gold-500 transition-colors"
        title="拖拽排序"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      <div className="flex-shrink-0 flex flex-col gap-0.5">
        <button
          onClick={() => onMoveUp(item.id)}
          disabled={isFirst}
          className={cn(
            "p-0.5 rounded transition-colors",
            isFirst
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="上移"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMoveDown(item.id)}
          disabled={isLast}
          className={cn(
            "p-0.5 rounded transition-colors",
            isLast
              ? "text-ink-200 cursor-not-allowed"
              : "text-ink-400 hover:bg-gold-50 hover:text-gold-600",
          )}
          title="下移"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-900">{item.name}</span>
          <Badge variant={parentName ? "teal" : "default"} className="text-xs">
            {parentName ? "二级" : "一级"}
          </Badge>
          <Badge className={cn("text-xs", formatColor)}>
            {formatLabel}
          </Badge>
        </div>
        <div className="text-xs text-ink-400 mt-1">
          {parentName ? `上级：${parentName} · ` : ""}{item.description || "暂无描述"} · 排序：{item.sortOrder}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={item.enabled ? "green" : "default"}>
          {item.enabled ? "已启用" : "已禁用"}
        </Badge>

        <button
          onClick={() => onToggle(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title={item.enabled ? "禁用" : "启用"}
        >
          {item.enabled ? (
            <ToggleRight className="w-5 h-5 text-green-600" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
        </button>

        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
          title="编辑"
        >
          <Edit3 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 rounded-md text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { teacher } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingTab>("grade");
  const [settings, setSettings] = useState<SchoolSetting[]>([]);
  const [classTypes, setClassTypes] = useState<ClassTypeCategory[]>([]);
  const [examPaperTypes, setExamPaperTypes] = useState<ExamPaperType[]>([]);
  const [lectureTypes, setLectureTypes] = useState<LectureType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SchoolSetting | null>(null);
  const [editingClassType, setEditingClassType] = useState<ClassTypeCategory | null>(null);
  const [editingExamPaperType, setEditingExamPaperType] = useState<ExamPaperType | null>(null);
  const [editingLectureType, setEditingLectureType] = useState<LectureType | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [classTypeFormData, setClassTypeFormData] = useState<ClassTypeFormData>(initialClassTypeFormData);
  const [examPaperTypeFormData, setExamPaperTypeFormData] = useState<ExamPaperTypeFormData>(initialExamPaperTypeFormData);
  const [lectureTypeFormData, setLectureTypeFormData] = useState<LectureTypeFormData>(initialLectureTypeFormData);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [classTypeFormErrors, setClassTypeFormErrors] = useState<Partial<Record<keyof ClassTypeFormData, string>>>({});
  const [examPaperTypeFormErrors, setExamPaperTypeFormErrors] = useState<Partial<Record<keyof ExamPaperTypeFormData, string>>>({});
  const [lectureTypeFormErrors, setLectureTypeFormErrors] = useState<Partial<Record<keyof LectureTypeFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const schoolId = teacher?.schoolId || "sch-1";
  const isClassTypeTab = activeTab === "classType";
  const isExamPaperTypeTab = activeTab === "examPaperType";
  const isLectureTypeTab = activeTab === "lectureType";
  const orderedExamPaperTypes = useMemo(() => orderedResourceTypes(examPaperTypes), [examPaperTypes]);
  const orderedLectureTypes = useMemo(() => orderedResourceTypes(lectureTypes), [lectureTypes]);
  const examPaperRootTypes = useMemo(
    () => orderedExamPaperTypes.filter((type) => !type.parentId && type.id !== editingExamPaperType?.id),
    [editingExamPaperType?.id, orderedExamPaperTypes],
  );
  const lectureRootTypes = useMemo(
    () => orderedLectureTypes.filter((type) => !type.parentId && type.id !== editingLectureType?.id),
    [editingLectureType?.id, orderedLectureTypes],
  );
  const editingExamPaperTypeHasChildren = Boolean(
    editingExamPaperType && examPaperTypes.some((type) => type.parentId === editingExamPaperType.id),
  );
  const editingLectureTypeHasChildren = Boolean(
    editingLectureType && lectureTypes.some((type) => type.parentId === editingLectureType.id),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const loadSettings = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      if (isExamPaperTypeTab) {
        const data = await settingsService.listExamPaperTypes(schoolId);
        setExamPaperTypes(data);
      } else if (isLectureTypeTab) {
        const data = await settingsService.listLectureTypes(schoolId);
        setLectureTypes(data);
      } else if (isClassTypeTab) {
        const data = await settingsService.listClassTypes(schoolId);
        setClassTypes(data);
      } else {
        const data = await settingsService.listSettings(schoolId, activeTab);
        setSettings(data);
      }
    } catch (e) {
      console.error("加载设置失败", e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, isClassTypeTab, isExamPaperTypeTab, isLectureTypeTab, schoolId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const reorderTypeSiblings = async (
    kind: "examPaper" | "lecture",
    currentList: Array<ExamPaperType | LectureType>,
    activeId: string,
    targetId: string,
  ) => {
    const activeType = currentList.find((type) => type.id === activeId);
    const targetType = currentList.find((type) => type.id === targetId);
    if (!activeType || !targetType) return;
    if ((activeType.parentId || null) !== (targetType.parentId || null)) return;

    const siblings = siblingTypes(currentList, activeType);
    const oldIndex = siblings.findIndex((type) => type.id === activeId);
    const newIndex = siblings.findIndex((type) => type.id === targetId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(siblings, oldIndex, newIndex);
    const updates = reordered.map((type, index) => ({ id: type.id, sortOrder: index + 1 }));
    const orderMap = new Map(updates.map((item) => [item.id, item.sortOrder]));
    const nextList = orderedResourceTypes(currentList.map((type) => ({
      ...type,
      sortOrder: orderMap.get(type.id) ?? type.sortOrder,
    })));

    if (kind === "examPaper") {
      setExamPaperTypes(nextList as ExamPaperType[]);
    } else {
      setLectureTypes(nextList as LectureType[]);
    }

    setSavingOrder(true);
    try {
      if (kind === "examPaper") {
        await settingsService.batchUpdateExamPaperTypeSortOrder(updates);
      } else {
        await settingsService.batchUpdateLectureTypeSortOrder(updates);
      }
    } catch (error) {
      console.error("保存排序失败", error);
      toast.error("保存排序失败", error instanceof Error ? error.message : undefined);
      await loadSettings();
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (isExamPaperTypeTab) {
      await reorderTypeSiblings("examPaper", examPaperTypes, String(active.id), String(over.id));
      return;
    }
    if (isLectureTypeTab) {
      await reorderTypeSiblings("lecture", lectureTypes, String(active.id), String(over.id));
      return;
    }

    const currentList: Array<{ id: string; sortOrder: number }> = isClassTypeTab ? classTypes : settings;
    const oldIndex = currentList.findIndex((item) => item.id === active.id);
    const newIndex = currentList.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newList = arrayMove(currentList, oldIndex, newIndex);
    if (isClassTypeTab) {
      setClassTypes(newList as ClassTypeCategory[]);
    } else {
      setSettings(newList as SchoolSetting[]);
    }

    setSavingOrder(true);
    try {
      const updates = newList.map((item, index) => ({ id: item.id, sortOrder: index + 1 }));
      if (isClassTypeTab) {
        await settingsService.batchUpdateClassTypeSortOrder(updates);
      } else {
        await settingsService.batchUpdateSortOrder(updates);
      }
    } catch (error) {
      console.error("保存排序失败", error);
      toast.error("保存排序失败", error instanceof Error ? error.message : undefined);
      await loadSettings();
    } finally {
      setSavingOrder(false);
    }
  };

  /** 通过上下箭头移动排序 */
  const handleMove = async (id: string, direction: "up" | "down") => {
    if (isExamPaperTypeTab || isLectureTypeTab) {
      const kind = isExamPaperTypeTab ? "examPaper" : "lecture";
      const currentList = isExamPaperTypeTab ? examPaperTypes : lectureTypes;
      const current = currentList.find((type) => type.id === id);
      if (!current) return;
      const siblings = siblingTypes(currentList, current);
      const index = siblings.findIndex((type) => type.id === id);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= siblings.length) return;
      await reorderTypeSiblings(kind, currentList, id, siblings[targetIndex].id);
      return;
    }

    const currentList: Array<{ id: string; sortOrder: number }> = isClassTypeTab ? classTypes : settings;
    const index = currentList.findIndex((item) => item.id === id);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;

    const newList = arrayMove(currentList, index, targetIndex);
    if (isClassTypeTab) {
      setClassTypes(newList as ClassTypeCategory[]);
    } else {
      setSettings(newList as SchoolSetting[]);
    }

    setSavingOrder(true);
    try {
      const updates = newList.map((item, itemIndex) => ({ id: item.id, sortOrder: itemIndex + 1 }));
      if (isClassTypeTab) {
        await settingsService.batchUpdateClassTypeSortOrder(updates);
      } else {
        await settingsService.batchUpdateSortOrder(updates);
      }
    } catch (error) {
      console.error("保存排序失败", error);
      toast.error("保存排序失败", error instanceof Error ? error.message : undefined);
      await loadSettings();
    } finally {
      setSavingOrder(false);
    }
  };

  const openCreateModal = () => {
    if (isExamPaperTypeTab) {
      setEditingExamPaperType(null);
      setExamPaperTypeFormData(initialExamPaperTypeFormData);
      setExamPaperTypeFormErrors({});
    } else if (isLectureTypeTab) {
      setEditingLectureType(null);
      setLectureTypeFormData(initialLectureTypeFormData);
      setLectureTypeFormErrors({});
    } else if (isClassTypeTab) {
      setEditingClassType(null);
      setClassTypeFormData(initialClassTypeFormData);
      setClassTypeFormErrors({});
    } else {
      setEditingItem(null);
      setFormData(initialFormData);
      setFormErrors({});
    }
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    if (isExamPaperTypeTab) {
      const et = item as ExamPaperType;
      setEditingExamPaperType(et);
      setExamPaperTypeFormData({
        name: et.name,
        description: et.description || "",
        parentId: et.parentId || "",
        format: et.format,
        sortOrder: String(et.sortOrder),
        enabled: et.enabled,
      });
      setExamPaperTypeFormErrors({});
    } else if (isLectureTypeTab) {
      const lt = item as LectureType;
      setEditingLectureType(lt);
      setLectureTypeFormData({
        name: lt.name,
        description: lt.description || "",
        parentId: lt.parentId || "",
        format: lt.format,
        sortOrder: String(lt.sortOrder),
        enabled: lt.enabled,
      });
      setLectureTypeFormErrors({});
    } else if (isClassTypeTab) {
      const ct = item as ClassTypeCategory;
      setEditingClassType(ct);
      setClassTypeFormData({
        name: ct.name,
        description: ct.description || "",
        color: ct.color || "#6b7280",
        sortOrder: String(ct.sortOrder),
        enabled: ct.enabled,
      });
      setClassTypeFormErrors({});
    } else {
      const s = item as SchoolSetting;
      setEditingItem(s);
      setFormData({
        name: s.name,
        value: s.value,
        sortOrder: String(s.sortOrder),
        enabled: s.enabled,
      });
      setFormErrors({});
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setEditingClassType(null);
    setEditingExamPaperType(null);
    setEditingLectureType(null);
    setFormData(initialFormData);
    setClassTypeFormData(initialClassTypeFormData);
    setExamPaperTypeFormData(initialExamPaperTypeFormData);
    setLectureTypeFormData(initialLectureTypeFormData);
    setFormErrors({});
    setClassTypeFormErrors({});
    setExamPaperTypeFormErrors({});
    setLectureTypeFormErrors({});
  };

  const validateForm = (): boolean => {
    if (isExamPaperTypeTab) {
      const errors: Partial<Record<keyof ExamPaperTypeFormData, string>> = {};
      if (!examPaperTypeFormData.name.trim()) {
        errors.name = "请输入试卷类型名称";
      }
      if (examPaperTypeFormData.sortOrder && isNaN(Number(examPaperTypeFormData.sortOrder))) {
        errors.sortOrder = "排序必须是数字";
      }
      setExamPaperTypeFormErrors(errors);
      return Object.keys(errors).length === 0;
    }
    if (isLectureTypeTab) {
      const errors: Partial<Record<keyof LectureTypeFormData, string>> = {};
      if (!lectureTypeFormData.name.trim()) {
        errors.name = "请讲讲义类型名称";
      }
      if (lectureTypeFormData.sortOrder && isNaN(Number(lectureTypeFormData.sortOrder))) {
        errors.sortOrder = "排序必须是数字";
      }
      setLectureTypeFormErrors(errors);
      return Object.keys(errors).length === 0;
    }
    if (isClassTypeTab) {
      const errors: Partial<Record<keyof ClassTypeFormData, string>> = {};
      if (!classTypeFormData.name.trim()) {
        errors.name = "请输入班型名称";
      }
      if (classTypeFormData.sortOrder && isNaN(Number(classTypeFormData.sortOrder))) {
        errors.sortOrder = "排序必须是数字";
      }
      setClassTypeFormErrors(errors);
      return Object.keys(errors).length === 0;
    }
    const errors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.name.trim()) {
      errors.name = "请输入名称";
    }
    if (!formData.value.trim()) {
      errors.value = "请输入值（英文标识）";
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(formData.value)) {
      errors.value = "值必须以字母开头，只能包含字母、数字、下划线和连字符";
    }
    if (formData.sortOrder && isNaN(Number(formData.sortOrder))) {
      errors.sortOrder = "排序必须是数字";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (isExamPaperTypeTab) {
        if (editingExamPaperType) {
          await settingsService.updateExamPaperType(editingExamPaperType.id, {
            name: examPaperTypeFormData.name.trim(),
            description: examPaperTypeFormData.description.trim() || undefined,
            parentId: examPaperTypeFormData.parentId || null,
            format: examPaperTypeFormData.format,
            sortOrder: examPaperTypeFormData.sortOrder ? Number(examPaperTypeFormData.sortOrder) : undefined,
            enabled: examPaperTypeFormData.enabled,
          });
        } else {
          await settingsService.createExamPaperType(schoolId, {
            name: examPaperTypeFormData.name.trim(),
            description: examPaperTypeFormData.description.trim() || undefined,
            parentId: examPaperTypeFormData.parentId || null,
            format: examPaperTypeFormData.format,
            sortOrder: examPaperTypeFormData.sortOrder ? Number(examPaperTypeFormData.sortOrder) : undefined,
            enabled: examPaperTypeFormData.enabled,
          });
        }
      } else if (isLectureTypeTab) {
        if (editingLectureType) {
          await settingsService.updateLectureType(editingLectureType.id, {
            name: lectureTypeFormData.name.trim(),
            description: lectureTypeFormData.description.trim() || undefined,
            parentId: lectureTypeFormData.parentId || null,
            format: lectureTypeFormData.format,
            sortOrder: lectureTypeFormData.sortOrder ? Number(lectureTypeFormData.sortOrder) : undefined,
            enabled: lectureTypeFormData.enabled,
          });
        } else {
          await settingsService.createLectureType(schoolId, {
            name: lectureTypeFormData.name.trim(),
            description: lectureTypeFormData.description.trim() || undefined,
            parentId: lectureTypeFormData.parentId || null,
            format: lectureTypeFormData.format,
            sortOrder: lectureTypeFormData.sortOrder ? Number(lectureTypeFormData.sortOrder) : undefined,
            enabled: lectureTypeFormData.enabled,
          });
        }
      } else if (isClassTypeTab) {
        if (editingClassType) {
          await settingsService.updateClassType(editingClassType.id, {
            name: classTypeFormData.name.trim(),
            description: classTypeFormData.description.trim() || undefined,
            color: classTypeFormData.color || undefined,
            sortOrder: classTypeFormData.sortOrder ? Number(classTypeFormData.sortOrder) : undefined,
            enabled: classTypeFormData.enabled,
          });
        } else {
          await settingsService.createClassType(schoolId, {
            name: classTypeFormData.name.trim(),
            description: classTypeFormData.description.trim() || undefined,
            color: classTypeFormData.color || undefined,
            sortOrder: classTypeFormData.sortOrder ? Number(classTypeFormData.sortOrder) : undefined,
            enabled: classTypeFormData.enabled,
          });
        }
      } else {
        if (editingItem) {
          await settingsService.updateSetting(editingItem.id, {
            name: formData.name.trim(),
            value: formData.value.trim(),
            sortOrder: formData.sortOrder ? Number(formData.sortOrder) : undefined,
            enabled: formData.enabled,
          });
        } else {
          await settingsService.createSetting(schoolId, {
            type: activeTab,
            name: formData.name.trim(),
            value: formData.value.trim(),
            sortOrder: formData.sortOrder ? Number(formData.sortOrder) : undefined,
            enabled: formData.enabled,
          });
        }
      }
      await loadSettings();
      closeModal();
    } catch (e: any) {
      console.error("保存失败", e);
      toast.error("保存失败", e instanceof Error ? e.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      if (isExamPaperTypeTab) {
        await settingsService.toggleExamPaperType(id);
      } else if (isLectureTypeTab) {
        await settingsService.toggleLectureType(id);
      } else if (isClassTypeTab) {
        await settingsService.toggleClassType(id);
      } else {
        await settingsService.toggleSetting(id);
      }
      await loadSettings();
    } catch (e) {
      console.error("切换状态失败", e);
      toast.error("切换状态失败", e instanceof Error ? e.message : undefined);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmText = isExamPaperTypeTab
      ? "确定要删除这个试卷类型吗？"
      : isLectureTypeTab
      ? "确定要删除这个讲义类型吗？"
      : isClassTypeTab
      ? "确定要删除这个班型吗？"
      : "确定要删除这个设置项吗？";
    if (!confirm(confirmText)) return;
    try {
      if (isExamPaperTypeTab) {
        await settingsService.deleteExamPaperType(id);
      } else if (isLectureTypeTab) {
        await settingsService.deleteLectureType(id);
      } else if (isClassTypeTab) {
        await settingsService.deleteClassType(id);
      } else {
        await settingsService.deleteSetting(id);
      }
      await loadSettings();
    } catch (e) {
      console.error("删除失败", e);
      toast.error("删除失败", e instanceof Error ? e.message : undefined);
    }
  };

  const currentTab = tabConfig.find((t) => t.key === activeTab)!;

  return (
    <div className="min-h-screen bg-mist">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <PageHeader
          title="系统设置"
          description="管理学校的年级、学年、来源、题类和分类等基础配置，支持拖拽或上下箭头排序"
          icon={<Settings className="w-5 h-5" />}
          action={
            <div className="flex items-center gap-2">
              {savingOrder && (
                <span className="text-xs text-ink-400">保存排序中...</span>
              )}
              <Button variant="gold" onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-1.5" />
                新增{currentTab.label}
              </Button>
            </div>
          }
        />

        {/* Tabs */}
        <div className="mb-6 border-b border-ink-200">
          <div className="flex gap-1">
            {tabConfig.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? "text-gold-600 border-gold-500"
                    : "text-ink-500 border-transparent hover:text-ink-700 hover:border-ink-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Description */}
        <div className="mb-4 text-sm text-ink-500">
          {currentTab.description}
        </div>

        {/* Settings List */}
        <Card>
          {loading ? (
            <div className="py-12 text-center text-ink-500">加载中...</div>
          ) : (
            (isExamPaperTypeTab
              ? examPaperTypes.length
              : isLectureTypeTab
              ? lectureTypes.length
              : isClassTypeTab
              ? classTypes.length
              : settings.length) === 0
          ) ? (
            <div className="py-12 text-center text-ink-500">
              暂无{currentTab.label}设置，点击右上角"新增"按钮添加
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={
                  (isExamPaperTypeTab
                    ? orderedExamPaperTypes
                    : isLectureTypeTab
                    ? orderedLectureTypes
                    : isClassTypeTab
                    ? classTypes
                    : settings
                  ).map((s) => s.id)
                }
                strategy={verticalListSortingStrategy}
              >
                <div className="divide-y divide-ink-100">
                  {(isExamPaperTypeTab
                    ? orderedExamPaperTypes
                    : isLectureTypeTab
                    ? orderedLectureTypes
                    : isClassTypeTab
                    ? classTypes
                    : settings
                  ).map((item, idx, arr) =>
                    isExamPaperTypeTab ? (
                      <SortableExamPaperTypeItem
                        key={item.id}
                        item={item as ExamPaperType}
                        parentName={examPaperTypes.find((type) => type.id === (item as ExamPaperType).parentId)?.name}
                        isFirst={siblingTypes(examPaperTypes, item as ExamPaperType)[0]?.id === item.id}
                        isLast={siblingTypes(examPaperTypes, item as ExamPaperType).at(-1)?.id === item.id}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                        onMoveUp={(id) => handleMove(id, "up")}
                        onMoveDown={(id) => handleMove(id, "down")}
                      />
                    ) : isLectureTypeTab ? (
                      <SortableLectureTypeItem
                        key={item.id}
                        item={item as LectureType}
                        parentName={lectureTypes.find((type) => type.id === (item as LectureType).parentId)?.name}
                        isFirst={siblingTypes(lectureTypes, item as LectureType)[0]?.id === item.id}
                        isLast={siblingTypes(lectureTypes, item as LectureType).at(-1)?.id === item.id}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                        onMoveUp={(id) => handleMove(id, "up")}
                        onMoveDown={(id) => handleMove(id, "down")}
                      />
                    ) : isClassTypeTab ? (
                      <SortableClassTypeItem
                        key={item.id}
                        item={item as ClassTypeCategory}
                        isFirst={idx === 0}
                        isLast={idx === arr.length - 1}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                        onMoveUp={(id) => handleMove(id, "up")}
                        onMoveDown={(id) => handleMove(id, "down")}
                      />
                    ) : (
                      <SortableSettingItem
                        key={item.id}
                        item={item as SchoolSetting}
                        isFirst={idx === 0}
                        isLast={idx === arr.length - 1}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                        onMoveUp={(id) => handleMove(id, "up")}
                        onMoveDown={(id) => handleMove(id, "down")}
                      />
                    ),
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Card>

        {/* Create/Edit Modal */}
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={isExamPaperTypeTab
            ? (editingExamPaperType ? `编辑${currentTab.label}` : `新增${currentTab.label}`)
            : isLectureTypeTab
            ? (editingLectureType ? `编辑${currentTab.label}` : `新增${currentTab.label}`)
            : isClassTypeTab
            ? (editingClassType ? `编辑${currentTab.label}` : `新增${currentTab.label}`)
            : (editingItem ? `编辑${currentTab.label}` : `新增${currentTab.label}`)}
          description={isExamPaperTypeTab
            ? (editingExamPaperType ? "修改试卷类型信息" : "添加新的试卷类型")
            : isLectureTypeTab
            ? (editingLectureType ? "修改讲义类型信息" : "添加新的讲义类型")
            : isClassTypeTab
            ? (editingClassType ? "修改班型信息" : "添加新的班型")
            : (editingItem ? "修改设置项信息" : "添加新的设置项")}
          footer={
            <>
              <Button variant="outline" onClick={closeModal} disabled={submitting}>
                取消
              </Button>
              <Button variant="gold" onClick={handleSubmit} loading={submitting}>
                {isExamPaperTypeTab
                  ? (editingExamPaperType ? "保存修改" : "确认添加")
                  : isLectureTypeTab
                  ? (editingLectureType ? "保存修改" : "确认添加")
                  : isClassTypeTab
                  ? (editingClassType ? "保存修改" : "确认添加")
                  : (editingItem ? "保存修改" : "确认添加")}
              </Button>
            </>
          }
        >
          {isExamPaperTypeTab ? (
            <div className="space-y-4">
              <Input
                label="试卷类型名称"
                placeholder="如：午间练、晚间作业、考试"
                value={examPaperTypeFormData.name}
                onChange={(e) => setExamPaperTypeFormData({ ...examPaperTypeFormData, name: e.target.value })}
                error={examPaperTypeFormErrors.name}
                autoFocus
              />
              <Input
                label="描述"
                placeholder="试卷类型描述（可选）"
                value={examPaperTypeFormData.description}
                onChange={(e) => setExamPaperTypeFormData({ ...examPaperTypeFormData, description: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">
                  上级类型
                </label>
                <select
                  value={examPaperTypeFormData.parentId}
                  onChange={(e) => setExamPaperTypeFormData({
                    ...examPaperTypeFormData,
                    parentId: e.target.value,
                    sortOrder: "",
                  })}
                  disabled={editingExamPaperTypeHasChildren}
                  className="w-full rounded-md border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-800 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:bg-mist disabled:text-ink-400"
                >
                  <option value="">无（一级类型）</option>
                  {examPaperRootTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-400">
                  {editingExamPaperTypeHasChildren
                    ? "该类型已有二级类型，需先移动或删除子类型后才能调整层级"
                    : "选择一个一级类型后，当前类型将作为其二级类型"}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  格式类型
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border border-ink-200 rounded-lg cursor-pointer hover:bg-gold-50 hover:border-gold-300 transition-colors">
                    <input
                      type="radio"
                      checked={examPaperTypeFormData.format === "simple"}
                      onChange={() => setExamPaperTypeFormData({ ...examPaperTypeFormData, format: "simple" })}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-ink-900">简易格式</div>
                      <div className="text-xs text-ink-500 mt-0.5">无题型分组，适用于午间练、晚间作业等</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-ink-200 rounded-lg cursor-pointer hover:bg-gold-50 hover:border-gold-300 transition-colors">
                    <input
                      type="radio"
                      checked={examPaperTypeFormData.format === "gaokao"}
                      onChange={() => setExamPaperTypeFormData({ ...examPaperTypeFormData, format: "gaokao" })}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-ink-900">高考格式</div>
                      <div className="text-xs text-ink-500 mt-0.5">有题型分组，按单选题、多选题、判断题等分类</div>
                    </div>
                  </label>
                </div>
              </div>
              <Input
                label="排序"
                type="number"
                placeholder="留空则自动排到最后"
                value={examPaperTypeFormData.sortOrder}
                onChange={(e) => setExamPaperTypeFormData({ ...examPaperTypeFormData, sortOrder: e.target.value })}
                error={examPaperTypeFormErrors.sortOrder}
                hint="数字越小排序越靠前，也可以在列表中直接拖拽排序"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExamPaperTypeFormData({ ...examPaperTypeFormData, enabled: !examPaperTypeFormData.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    examPaperTypeFormData.enabled ? "bg-green-500" : "bg-ink-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      examPaperTypeFormData.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-ink-700">
                  {examPaperTypeFormData.enabled ? "启用" : "禁用"}
                </span>
              </div>
            </div>
          ) : isLectureTypeTab ? (
            <div className="space-y-4">
              <Input
                label="讲义类型名称"
                placeholder="如：教案、学案、辅导训练"
                value={lectureTypeFormData.name}
                onChange={(e) => setLectureTypeFormData({ ...lectureTypeFormData, name: e.target.value })}
                error={lectureTypeFormErrors.name}
                autoFocus
              />
              <Input
                label="描述"
                placeholder="讲义类型描述（可选）"
                value={lectureTypeFormData.description}
                onChange={(e) => setLectureTypeFormData({ ...lectureTypeFormData, description: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">
                  上级类型
                </label>
                <select
                  value={lectureTypeFormData.parentId}
                  onChange={(e) => setLectureTypeFormData({
                    ...lectureTypeFormData,
                    parentId: e.target.value,
                    sortOrder: "",
                  })}
                  disabled={editingLectureTypeHasChildren}
                  className="w-full rounded-md border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-800 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:bg-mist disabled:text-ink-400"
                >
                  <option value="">无（一级类型）</option>
                  {lectureRootTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-400">
                  {editingLectureTypeHasChildren
                    ? "该类型已有二级类型，需先移动或删除子类型后才能调整层级"
                    : "选择一个一级类型后，当前类型将作为其二级类型"}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  格式类型
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border border-ink-200 rounded-lg cursor-pointer hover:bg-gold-50 hover:border-gold-300 transition-colors">
                    <input
                      type="radio"
                      checked={lectureTypeFormData.format === "table"}
                      onChange={() => setLectureTypeFormData({ ...lectureTypeFormData, format: "table" })}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-ink-900">表格形式</div>
                      <div className="text-xs text-ink-500 mt-0.5">教案格式，以表格形式呈现教学内容</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-ink-200 rounded-lg cursor-pointer hover:bg-gold-50 hover:border-gold-300 transition-colors">
                    <input
                      type="radio"
                      checked={lectureTypeFormData.format === "mixed"}
                      onChange={() => setLectureTypeFormData({ ...lectureTypeFormData, format: "mixed" })}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-ink-900">混合结构</div>
                      <div className="text-xs text-ink-500 mt-0.5">知识块和题目混合，适用于学案、辅导训练等</div>
                    </div>
                  </label>
                </div>
              </div>
              <Input
                label="排序"
                type="number"
                placeholder="留空则自动排到最后"
                value={lectureTypeFormData.sortOrder}
                onChange={(e) => setLectureTypeFormData({ ...lectureTypeFormData, sortOrder: e.target.value })}
                error={lectureTypeFormErrors.sortOrder}
                hint="数字越小排序越靠前，也可以在列表中直接拖拽排序"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLectureTypeFormData({ ...lectureTypeFormData, enabled: !lectureTypeFormData.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    lectureTypeFormData.enabled ? "bg-green-500" : "bg-ink-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      lectureTypeFormData.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-ink-700">
                  {lectureTypeFormData.enabled ? "启用" : "禁用"}
                </span>
              </div>
            </div>
          ) : isClassTypeTab ? (
            <div className="space-y-4">
              <Input
                label="班型名称"
                placeholder="如：强基班、实验班、普通班"
                value={classTypeFormData.name}
                onChange={(e) => setClassTypeFormData({ ...classTypeFormData, name: e.target.value })}
                error={classTypeFormErrors.name}
                autoFocus
              />
              <Input
                label="描述"
                placeholder="班型描述（可选）"
                value={classTypeFormData.description}
                onChange={(e) => setClassTypeFormData({ ...classTypeFormData, description: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">
                  标识颜色
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={classTypeFormData.color}
                    onChange={(e) => setClassTypeFormData({ ...classTypeFormData, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border border-ink-200"
                  />
                  <Input
                    value={classTypeFormData.color}
                    onChange={(e) => setClassTypeFormData({ ...classTypeFormData, color: e.target.value })}
                    placeholder="#6b7280"
                    className="flex-1"
                  />
                </div>
              </div>
              <Input
                label="排序"
                type="number"
                placeholder="留空则自动排到最后"
                value={classTypeFormData.sortOrder}
                onChange={(e) => setClassTypeFormData({ ...classTypeFormData, sortOrder: e.target.value })}
                error={classTypeFormErrors.sortOrder}
                hint="数字越小排序越靠前，也可以在列表中直接拖拽排序"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setClassTypeFormData({ ...classTypeFormData, enabled: !classTypeFormData.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    classTypeFormData.enabled ? "bg-green-500" : "bg-ink-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      classTypeFormData.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-ink-700">
                  {classTypeFormData.enabled ? "启用" : "禁用"}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label="名称"
                placeholder={`请输入${currentTab.label}名称，如：高一`}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={formErrors.name}
              />
              <Input
                label="值（英文标识）"
                placeholder="请输入英文标识，如：grade10"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                error={formErrors.value}
                hint="用于系统内部标识，建议使用英文小写字母和数字"
              />
              <Input
                label="排序"
                type="number"
                placeholder="留空则自动排到最后"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                error={formErrors.sortOrder}
                hint="数字越小排序越靠前，也可以在列表中直接拖拽排序"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.enabled ? "bg-green-500" : "bg-ink-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-ink-700">
                  {formData.enabled ? "启用" : "禁用"}
                </span>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}

export default SettingsPage;

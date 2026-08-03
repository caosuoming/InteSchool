import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileQuestion,
  Image as ImageIcon,
  Link as LinkIcon,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type {
  LessonElementActionAnimation,
  LessonElementAnimation,
  LessonElementExitAnimation,
  LessonSlide,
  LessonSlideElement,
  LessonSlideTextRegion,
  Question,
  Student,
} from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export type LessonEditorInspectorTab = "content" | "properties" | "animation" | "association";

type AnimationPanel = "element" | "order";
type AssociationPanel = "students" | "questions";

interface LessonEditorInspectorProps {
  slide: LessonSlide;
  elements: LessonSlideElement[];
  selectedElement: LessonSlideElement | null;
  selectedTextRegion: LessonSlideTextRegion | null;
  students: Student[];
  relatedQuestions: Question[];
  canDeleteSlide: boolean;
  canMergeSlide: boolean;
  onSelectElement: (id: string | null) => void;
  onSelectTextRegion: (region: LessonSlideTextRegion | null) => void;
  onUpdateElement: (patch: Partial<LessonSlideElement>) => void;
  onDeleteElement: () => void;
  onUpdateTextStyle: (region: LessonSlideTextRegion, fontSize: number) => void;
  onUpdateSlide: (patch: Partial<LessonSlide>) => void;
  onAddText: () => void;
  onAddImage: (file: File) => void;
  onAddLink: () => void;
  onAddSlide: () => void;
  onSplitSlide: () => void;
  onMergeSlide: () => void;
  onDeleteSlide: () => void;
  onOpenFormulaEditor: (field: "stem" | "answer" | "analysis") => void;
  onMoveAnimationOrder: (elementId: string, direction: -1 | 1) => void;
  onToggleStudent: (studentId: string) => void;
  onLoadRelatedQuestions: () => void;
  onAddRelatedQuestion: (question: Question) => void;
  onRemoveRelatedQuestion: (questionId: string) => void;
}

const QUESTION_TYPE_LABEL: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const TEXT_REGION_LABEL: Record<LessonSlideTextRegion, string> = {
  title: "页面标题",
  content: "页面正文",
  stem: "题干",
  options: "选项",
};

const DEFAULT_TEXT_SIZE: Record<LessonSlideTextRegion, number> = {
  title: 32,
  content: 20,
  stem: 24,
  options: 16,
};

function elementLabel(element: LessonSlideElement, index: number): string {
  if (element.kind === "image") return element.alt || `图片 ${index + 1}`;
  if (element.href) return element.content || `链接 ${index + 1}`;
  return element.content?.trim().slice(0, 18) || `文本 ${index + 1}`;
}

export function LessonEditorInspector({
  slide,
  elements,
  selectedElement,
  selectedTextRegion,
  students,
  relatedQuestions,
  canDeleteSlide,
  canMergeSlide,
  onSelectElement,
  onSelectTextRegion,
  onUpdateElement,
  onDeleteElement,
  onUpdateTextStyle,
  onUpdateSlide,
  onAddText,
  onAddImage,
  onAddLink,
  onAddSlide,
  onSplitSlide,
  onMergeSlide,
  onDeleteSlide,
  onOpenFormulaEditor,
  onMoveAnimationOrder,
  onToggleStudent,
  onLoadRelatedQuestions,
  onAddRelatedQuestion,
  onRemoveRelatedQuestion,
}: LessonEditorInspectorProps) {
  const [tab, setTab] = useState<LessonEditorInspectorTab>("content");
  const [animationPanel, setAnimationPanel] = useState<AnimationPanel>("element");
  const [associationPanel, setAssociationPanel] = useState<AssociationPanel>("students");
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === "association" && associationPanel === "questions") {
      onLoadRelatedQuestions();
    }
  }, [associationPanel, onLoadRelatedQuestions, tab]);

  const selectElement = (id: string | null) => {
    onSelectElement(id);
    if (id) onSelectTextRegion(null);
  };

  const selectTextRegion = (region: LessonSlideTextRegion | null) => {
    onSelectTextRegion(region);
    if (region) onSelectElement(null);
  };

  const handleImageFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    onAddImage(file);
  };

  const orderedElements = [...elements].sort((left, right) =>
    (left.animationOrder || elements.indexOf(left) + 1)
    - (right.animationOrder || elements.indexOf(right) + 1));
  const canInsertElements = slide.type !== "courseware";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-4 border-b border-ink-200">
        {([
          ["content", "内容"],
          ["properties", "属性"],
          ["animation", "动画"],
          ["association", "关联"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "border-b-2 px-1 py-2.5 text-xs font-medium transition-colors",
              tab === value
                ? "border-gold-400 text-gold-700"
                : "border-transparent text-ink-500 hover:text-ink-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === "content" && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-medium text-ink-700">插入内容</div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-3" onClick={onAddText} disabled={!canInsertElements}>
                  <Type className="h-4 w-4" />
                  文本
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto flex-col gap-1 py-3"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={!canInsertElements}
                >
                  <ImageIcon className="h-4 w-4" />
                  图片
                </Button>
                <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-3" onClick={onAddLink} disabled={!canInsertElements}>
                  <LinkIcon className="h-4 w-4" />
                  超链接
                </Button>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  handleImageFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>

            <div className="border-t border-ink-100 pt-3">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink-700">
                <span>页面对象</span>
                <span className="text-[11px] font-normal text-ink-400">{elements.length} 个自由元素</span>
              </div>
              <div className="space-y-1.5">
                {(["title", "content", "stem", "options"] as LessonSlideTextRegion[])
                  .filter((region) => {
                    if (slide.freeformLayout) return false;
                    if (region === "stem" || region === "options") return slide.type === "question";
                    if (region === "content") return slide.type !== "question" && Boolean(slide.content);
                    return slide.type !== "question";
                  })
                  .map((region) => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => {
                        selectTextRegion(region);
                        setTab("properties");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs",
                        selectedTextRegion === region
                          ? "border-gold-300 bg-gold-50 text-gold-800"
                          : "border-ink-100 text-ink-700 hover:border-ink-300",
                      )}
                    >
                      <Type className="h-3.5 w-3.5" />
                      <span className="flex-1">{TEXT_REGION_LABEL[region]}</span>
                    </button>
                  ))}
                {elements.map((element, index) => (
                  <button
                    key={element.id}
                    type="button"
                    onClick={() => {
                      selectElement(element.id);
                      setTab("properties");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs",
                      selectedElement?.id === element.id
                        ? "border-gold-300 bg-gold-50 text-gold-800"
                        : "border-ink-100 text-ink-700 hover:border-ink-300",
                    )}
                  >
                    {element.kind === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : element.href ? <LinkIcon className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
                    <span className="min-w-0 flex-1 truncate">{elementLabel(element, index)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "properties" && selectedTextRegion && (
          <div className="space-y-4">
            <div className="rounded-lg bg-mist px-3 py-2 text-sm font-medium text-ink-800">
              {TEXT_REGION_LABEL[selectedTextRegion]}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-600">字号</label>
              <Input
                aria-label="字号"
                type="number"
                min={12}
                max={96}
                value={slide.textStyles?.[selectedTextRegion]?.fontSize || DEFAULT_TEXT_SIZE[selectedTextRegion]}
                onChange={(event) => onUpdateTextStyle(selectedTextRegion, Number(event.target.value) || DEFAULT_TEXT_SIZE[selectedTextRegion])}
              />
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => selectTextRegion(null)}>
              返回页面属性
            </Button>
          </div>
        )}

        {tab === "properties" && !selectedTextRegion && selectedElement && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-sm font-medium text-ink-800">
              {selectedElement.kind === "image" ? <ImageIcon className="h-4 w-4" /> : selectedElement.href ? <LinkIcon className="h-4 w-4" /> : <Type className="h-4 w-4" />}
              {selectedElement.kind === "image" ? "图片元素" : selectedElement.href ? "超链接元素" : "文本元素"}
            </div>

            {selectedElement.kind === "text" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-600">文本内容</label>
                  <Textarea
                    value={selectedElement.content}
                    onChange={(event) => onUpdateElement({ content: event.target.value })}
                    rows={4}
                  />
                </div>
                {selectedElement.href !== undefined && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-600">链接地址</label>
                    <Input
                      type="url"
                      value={selectedElement.href}
                      onChange={(event) => onUpdateElement({ href: event.target.value })}
                      placeholder="https://example.com"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-ink-600">
                    字号
                    <Input
                      type="number"
                      min={12}
                      max={96}
                      value={selectedElement.fontSize || 24}
                      onChange={(event) => onUpdateElement({ fontSize: Number(event.target.value) || 24 })}
                    />
                  </label>
                  <label className="text-xs font-medium text-ink-600">
                    对齐
                    <select
                      value={selectedElement.textAlign || "left"}
                      onChange={(event) => onUpdateElement({ textAlign: event.target.value as "left" | "center" | "right" })}
                      className="input-base"
                    >
                      <option value="left">左对齐</option>
                      <option value="center">居中</option>
                      <option value="right">右对齐</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">图片说明</label>
                <Input
                  value={selectedElement.alt || ""}
                  onChange={(event) => onUpdateElement({ alt: event.target.value })}
                  placeholder="课件图片"
                />
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-medium text-ink-600">位置与尺寸（%）</div>
              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "width", "height"] as const).map((field) => (
                  <label key={field} className="text-[11px] text-ink-500">
                    {{ x: "横坐标", y: "纵坐标", width: "宽度", height: "高度" }[field]}
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(selectedElement[field])}
                      onChange={(event) => onUpdateElement({ [field]: Number(event.target.value) } as Partial<LessonSlideElement>)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={onDeleteElement}>
              <Trash2 className="h-4 w-4" />删除元素
            </Button>
            <Button variant="outline" size="sm" className="w-full" onClick={() => selectElement(null)}>
              返回页面属性
            </Button>
          </div>
        )}

        {tab === "properties" && !selectedTextRegion && !selectedElement && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-600">页面标题</label>
              <Input value={slide.title} onChange={(event) => onUpdateSlide({ title: event.target.value })} />
            </div>
            {(slide.type === "knowledge" || slide.type === "section") && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">页面内容</label>
                <Textarea
                  value={slide.content || ""}
                  onChange={(event) => onUpdateSlide({ content: event.target.value })}
                  rows={7}
                />
              </div>
            )}
            {slide.type === "question" && slide.questionSnapshot && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-ink-600">题目内容</div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenFormulaEditor("stem")}>编辑题干</Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenFormulaEditor("answer")}>编辑答案</Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenFormulaEditor("analysis")}>编辑解析</Button>
              </div>
            )}
            <div className="border-t border-ink-100 pt-3">
              <div className="mb-2 text-xs font-medium text-ink-600">页面操作</div>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full" onClick={onAddSlide}>
                  <Plus className="h-4 w-4" />在下方插入新页
                </Button>
                {slide.type === "knowledge" && (
                  <>
                    <Button variant="outline" size="sm" className="w-full" onClick={onSplitSlide}>拆分当前页</Button>
                    <Button variant="outline" size="sm" className="w-full" onClick={onMergeSlide} disabled={!canMergeSlide}>与下一页合并</Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={onDeleteSlide} disabled={!canDeleteSlide}>
                  <Trash2 className="h-4 w-4" />删除当前页
                </Button>
              </div>
            </div>
          </div>
        )}

        {tab === "animation" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 rounded-lg bg-mist p-1">
              {(["element", "order"] as AnimationPanel[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAnimationPanel(value)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium",
                    animationPanel === value ? "bg-paper text-ink-900 shadow-sm" : "text-ink-500",
                  )}
                >
                  {value === "element" ? "元素" : "顺序"}
                </button>
              ))}
            </div>

            {animationPanel === "element" && (
              selectedElement ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-gold-200 bg-gold-50 p-2 text-xs text-gold-800">
                    {elementLabel(selectedElement, elements.indexOf(selectedElement))}
                  </div>
                  <label className="block text-xs font-medium text-ink-600">
                    出现
                    <select
                      className="input-base"
                      value={selectedElement.enterAnimation || selectedElement.animation || "none"}
                      onChange={(event) => onUpdateElement({
                        enterAnimation: event.target.value as LessonElementAnimation,
                        animation: event.target.value as LessonElementAnimation,
                      })}
                    >
                      <option value="none">无</option>
                      <option value="fade">淡入</option>
                      <option value="rise">上浮</option>
                      <option value="zoom">缩放</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-ink-600">
                    动作
                    <select
                      className="input-base"
                      value={selectedElement.actionAnimation || "none"}
                      onChange={(event) => onUpdateElement({ actionAnimation: event.target.value as LessonElementActionAnimation })}
                    >
                      <option value="none">无</option>
                      <option value="pulse">脉冲</option>
                      <option value="sway">摆动</option>
                      <option value="spin">旋转</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-ink-600">
                    消失
                    <select
                      className="input-base"
                      value={selectedElement.exitAnimation || "none"}
                      onChange={(event) => onUpdateElement({ exitAnimation: event.target.value as LessonElementExitAnimation })}
                    >
                      <option value="none">无</option>
                      <option value="fade">淡出</option>
                      <option value="shrink">缩小</option>
                      <option value="drop">下落</option>
                    </select>
                  </label>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-ink-500">选择一个自由元素后设置出现、动作和消失效果。</div>
                  {elements.map((element, index) => (
                    <button
                      key={element.id}
                      type="button"
                      onClick={() => selectElement(element.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-ink-100 px-2.5 py-2 text-left text-xs text-ink-700 hover:border-gold-300"
                    >
                      {element.kind === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
                      <span className="truncate">{elementLabel(element, index)}</span>
                    </button>
                  ))}
                </div>
              )
            )}

            {animationPanel === "order" && (
              <div className="space-y-2">
                {orderedElements.length === 0 ? (
                  <div className="py-6 text-center text-xs text-ink-400">暂无自由元素</div>
                ) : orderedElements.map((element, index) => (
                  <div key={element.id} className="flex items-center gap-2 rounded-lg border border-ink-100 p-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-ink-900 font-mono text-xs text-paper">{index + 1}</span>
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-xs text-ink-700" onClick={() => selectElement(element.id)}>
                      {elementLabel(element, index)}
                    </button>
                    <button type="button" disabled={index === 0} onClick={() => onMoveAnimationOrder(element.id, -1)} className="text-ink-400 disabled:opacity-25" aria-label="提前">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" disabled={index === orderedElements.length - 1} onClick={() => onMoveAnimationOrder(element.id, 1)} className="text-ink-400 disabled:opacity-25" aria-label="延后">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "association" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 rounded-lg bg-mist p-1">
              {(["students", "questions"] as AssociationPanel[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAssociationPanel(value)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium",
                    associationPanel === value ? "bg-paper text-ink-900 shadow-sm" : "text-ink-500",
                  )}
                >
                  {value === "students" ? "相关学生" : "相关题"}
                </button>
              ))}
            </div>

            {associationPanel === "students" && (
              <div className="space-y-1.5">
                <div className="pb-1 text-xs text-ink-500">已选 {(slide.askableStudentIds || []).length} 人</div>
                {students.map((student) => {
                  const selected = (slide.askableStudentIds || []).includes(student.id);
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => onToggleStudent(student.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                        selected ? "bg-gold-50 text-gold-800" : "text-ink-700 hover:bg-mist",
                      )}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-mist text-[10px]">{student.name.slice(0, 1)}</span>
                      <span className="flex-1">{student.name}</span>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {associationPanel === "questions" && (
              <div className="space-y-3">
                {(slide.relatedQuestionIds || []).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-ink-600">已关联题目</div>
                    {(slide.relatedQuestionIds || []).map((questionId, index) => (
                      <div key={questionId} className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 p-2">
                        <span className="text-xs text-emerald-700">#{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-emerald-800">{questionId}</span>
                        <button type="button" onClick={() => onRemoveRelatedQuestion(questionId)} className="text-emerald-600" aria-label="移除相关题">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-ink-600">推荐相关题</div>
                  {relatedQuestions.map((question) => {
                    const added = (slide.relatedQuestionIds || []).includes(question.id);
                    return (
                      <div key={question.id} className="rounded border border-ink-100 p-2">
                        <div className="mb-1 line-clamp-2 text-xs text-ink-700">{question.stem}</div>
                        <div className="flex items-center justify-between">
                          <Badge variant="ink">{QUESTION_TYPE_LABEL[question.type]}</Badge>
                          {added ? (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-600"><Check className="h-3 w-3" />已添加</span>
                          ) : (
                            <button type="button" onClick={() => onAddRelatedQuestion(question)} className="text-[11px] text-gold-700">+ 添加</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {relatedQuestions.length === 0 && (
                    <div className="py-6 text-center text-xs text-ink-400">
                      <FileQuestion className="mx-auto mb-2 h-5 w-5" />暂无推荐题目
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LessonEditorInspector;

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  BookOpen, Edit3, Eye, FileText, GraduationCap,
  Printer, Type, UserCheck, Users,
} from "lucide-react";
import { lectureService } from "@/services/lecture";
import { questionService } from "@/services/question";
import { classService } from "@/services/class";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { MathHtml } from "@/components/ui/MathHtml";
import type { AnyClass, Lecture, LectureSection, Question, Student } from "@/types";
import { cn, getOptionsGridCols } from "@/lib/utils";

type PaperSize = "A4" | "8K";

function flattenSections(sections: LectureSection[]): LectureSection[] {
  return sections.flatMap((section) => [section, ...flattenSections(section.children || [])]);
}

export default function LecturePreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      const loadedLecture = await lectureService.getLecture(id);
      if (!loadedLecture) {
        navigate("/my-resources");
        return;
      }

      const loadedClasses = loadedLecture.classIds.length > 0
        ? await classService.getClassesByIds(loadedLecture.classIds)
        : [];
      const classStudentGroups = await Promise.all(
        loadedLecture.classIds.map((classId) => classService.listStudentsByClass(classId)),
      );
      const classStudents = classStudentGroups.flat();
      const explicitStudents = await Promise.all(
        loadedLecture.studentIds.map((studentId) => classService.getStudent(studentId)),
      );
      const studentMap = new Map<string, Student>();
      [...classStudents, ...explicitStudents.filter((student): student is Student => Boolean(student))]
        .forEach((student) => studentMap.set(student.id, student));

      if (cancelled) return;
      setLecture(loadedLecture);
      setClasses(loadedClasses);
      setStudents(Array.from(studentMap.values()));
      setLoading(false);
    };
    load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, navigate]);

  const sections = useMemo(() => lecture?.sections || [], [lecture]);
  const columns = useMemo(
    () => sections.filter((section) => section.type === "chapter"),
    [sections],
  );
  const documentTitle = useMemo(
    () => lecture?.contentBlocks
      ?.find((block) => block.type === "documentTitle")
      ?.content.trim() || null,
    [lecture],
  );
  const documentTitleSectionId = useMemo(
    () => documentTitle
      ? sections.find(
        (section) => section.type === "chapter" && section.title.trim() === documentTitle,
      )?.id || null
      : null,
    [documentTitle, sections],
  );
  const questionCount = useMemo(
    () => flattenSections(sections).filter((section) => section.type === "question").length,
    [sections],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="py-20 text-center text-sm text-ink-400">
        讲义加载失败
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`预览：${lecture.title}`}
        description="检查讲义内容、版面与使用对象"
        icon={<Eye className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/lectures/${id}/edit`)}>
              <Edit3 className="w-4 h-4" />
              编辑讲义
            </Button>
            <Button variant="gold" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              打印
            </Button>
          </div>
        }
      />

      <Card className="no-print p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-gold-600" />
            <h3 className="font-serif font-semibold text-ink-900">讲义属性</h3>
          </div>
          <Badge variant={lecture.status === "published" ? "green" : "default"}>
            {lecture.status === "published" ? "已发布" : "草稿"}
          </Badge>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <Property label="标题" value={lecture.title} className="sm:col-span-2 xl:col-span-2" />
          <Property label="描述" value={lecture.description || "未填写"} className="sm:col-span-2 xl:col-span-2" />
          <Property label="年级" value={lecture.grade || "未设置"} icon={<GraduationCap className="w-3.5 h-3.5" />} />
          <Property label="学年" value={lecture.schoolYear || "未设置"} />
          <Property label="学期" value={lecture.semester || "上学期"} />
          <Property label="内容" value={`${columns.length} 栏目 · ${questionCount} 题`} />
        </div>
      </Card>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_290px] gap-4 items-start">
        <Card className="min-w-0 p-4">
          <div className="no-print flex items-center justify-end gap-3 mb-4 pb-3 border-b border-ink-100">
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                aria-label="纸张大小"
                value={paperSize}
                onChange={(event) => setPaperSize(event.target.value as PaperSize)}
                className="text-xs border border-ink-200 rounded-md px-2 py-1.5 bg-paper text-ink-700"
              >
                <option value="A4">A4 单栏</option>
                <option value="8K">8K 双栏</option>
              </select>
            </div>
          </div>

          <div className={cn("paper-sheet rounded-lg", paperSize === "8K" ? "paper-8k" : "paper-a4")}>
            <div className="paper-content p-6 lg:p-8 print-area" data-testid="lecture-paper">
              {!documentTitle && (
                <div className="text-center mb-7 pb-4 border-b-2 border-ink-200">
                  <MathHtml className="font-serif text-2xl font-bold text-ink-900 mb-2">
                    {lecture.title}
                  </MathHtml>
                  {lecture.description && (
                    <MathHtml className="text-sm text-ink-500">{lecture.description}</MathHtml>
                  )}
                </div>
              )}
              {sections.length === 0 ? (
                <div className="text-center py-16 text-ink-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-ink-200" />
                  <div className="text-sm">当前范围暂无内容</div>
                </div>
              ) : (
                <div className={cn("gap-x-8", paperSize === "8K" ? "columns-2" : "space-y-5")}>
                  {sections.map((section) => (
                    <div key={section.id} className="break-inside-avoid mb-5">
                      <PreviewSection
                        section={section}
                        isDocumentTitle={section.id === documentTitleSectionId}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="no-print space-y-4 xl:sticky xl:top-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-ink-100">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="font-serif font-semibold text-ink-900 text-sm">使用对象</h3>
              <Badge variant="ink">{students.length}</Badge>
            </div>
            {classes.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] font-medium text-ink-500 mb-1.5">适用班级</div>
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((item) => (
                    <span key={item.id} className="px-2 py-1 rounded bg-teal-50 text-xs text-teal-700 border border-teal-100">
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="text-[11px] font-medium text-ink-500 mb-1.5 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> 学生
            </div>
            {students.length === 0 ? (
              <div className="py-8 text-center rounded-lg border border-dashed border-ink-200 text-xs text-ink-400">
                未指定学生
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[430px] overflow-y-auto pr-1">
                {students.map((student) => (
                  <div key={student.id} className="flex items-center gap-2 rounded-md border border-ink-100 px-2.5 py-2">
                    <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {student.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-ink-800 truncate">{student.name}</div>
                      <div className="text-[10px] text-ink-400 truncate">{student.grade} · {student.studentNo}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-medium text-ink-600 mb-3">内容统计</div>
            <div className="grid grid-cols-2 gap-2">
              <Stat value={columns.length} label="栏目" />
              <Stat value={questionCount} label="题目" />
              <Stat value={flattenSections(sections).filter((section) => section.type === "knowledge").length} label="知识块" />
              <Stat value={flattenSections(sections).filter((section) => section.type === "text").length} label="文本框" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Property({ label, value, icon, className }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-2 min-w-0", className)}>
      <div className="text-[10px] text-ink-400 mb-0.5 flex items-center gap-1">{icon}{label}</div>
      <div className="text-xs font-medium text-ink-800 truncate" title={value}>{value}</div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/40 p-2 text-center">
      <div className="text-lg font-semibold text-ink-800">{value}</div>
      <div className="text-[10px] text-ink-400">{label}</div>
    </div>
  );
}

function PreviewSection({
  section,
  isDocumentTitle = false,
}: {
  section: LectureSection;
  isDocumentTitle?: boolean;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((value) => !value);

  useEffect(() => {
    if (section.type === "question" && section.questionId) {
      questionService.getQuestion(section.questionId).then(setQuestion);
    }
  }, [section]);

  // 章节标题
  if (section.type === "chapter") {
    if (isDocumentTitle) {
      return (
        <div className="text-center mb-7 pb-4 border-b-2 border-ink-200">
          <MathHtml className="font-serif text-2xl font-bold text-ink-900">
            {section.title}
          </MathHtml>
        </div>
      );
    }

    return (
      <div className="pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <MathHtml className="font-serif text-xl font-bold text-ink-900">
            {section.customLabel ? `${section.customLabel} ${section.title}` : section.title}
          </MathHtml>
        </div>
        {section.content && (
          <MathHtml className="mb-4 text-sm text-ink-600 leading-relaxed whitespace-pre-wrap pl-2">
            {section.content}
          </MathHtml>
        )}
        {section.children.length > 0 && (
          <div className="space-y-5 pl-3 border-l-2 border-ink-100 ml-2">
            {section.children.map((child) => (
              <PreviewSection key={child.id} section={child} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 题目
  if (section.type === "question") {
    return (
      <div className="pb-3">
        {question ? (
          <div className="space-y-2">
            <div
              role="button"
              tabIndex={0}
              onClick={toggleExpanded}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleExpanded();
                }
              }}
              aria-expanded={expanded}
              aria-label={`${expanded ? "隐藏" : "显示"}答案与解析：${question.stem}`}
              className="w-full text-left text-sm text-ink-900 leading-relaxed flex items-start gap-1.5 cursor-pointer"
            >
              {section.customLabel && (
                <span className="font-mono text-ink-400 flex-shrink-0">{section.customLabel}</span>
              )}
              <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
            </div>
            {question.options && question.options.length > 0 && (
              <div className={cn(
                "gap-2 grid",
                getOptionsGridCols(question.options.length),
              )}>
                {question.options.map((opt, i) => (
                  <div
                    key={i}
                    className={cn(
                      "p-2 rounded-md border text-sm flex items-start gap-1.5 min-w-0",
                      expanded && question.answer.includes(String.fromCharCode(65 + i))
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-ink-100",
                    )}
                  >
                    <span className="font-mono font-semibold text-ink-700 flex-shrink-0">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <MathHtml className="min-w-0 text-ink-900 break-all">{opt}</MathHtml>
                  </div>
                ))}
              </div>
            )}
            {expanded && (
              <div className="space-y-2 animate-fade-in">
                <div className="p-2.5 rounded-md bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900 flex items-start gap-1">
                  <span className="font-bold flex-shrink-0">答案：</span>
                  <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.answer}</MathHtml>
                </div>
                <div className="p-2.5 rounded-md bg-gold-50/30 border border-gold-200 text-sm text-ink-900 leading-relaxed flex items-start gap-1">
                  <span className="font-bold text-gold-700 flex-shrink-0">解析：</span>
                  <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.analysis}</MathHtml>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink-400">题目加载中...</div>
        )}
      </div>
    );
  }

  // 知识点只展示正文，不暴露内部名称或自动编号。
  if (section.type === "knowledge") {
    return (
      <div className="pb-3">
        <MathHtml className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">
          {section.content}
        </MathHtml>
      </div>
    );
  }

  // 文本（含空白行）
  if (!section.content && (section.title === "空白行" || section.title === "[空白行]")) {
    // 渲染为空白间距
    return <div className="h-8" />;
  }
  return (
    <div className="pb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Type className="w-4 h-4 text-ink-400" />
        <MathHtml className="font-serif font-medium text-ink-900">
          {section.customLabel ? `${section.customLabel} ${section.title}` : section.title}
        </MathHtml>
      </div>
      <MathHtml className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed pl-6">
        {section.content}
      </MathHtml>
    </div>
  );
}

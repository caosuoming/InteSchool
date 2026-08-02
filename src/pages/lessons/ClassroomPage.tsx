import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate, useParams } from "react-router";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  GripVertical,
  LogOut,
  Minus,
  Play,
  Plus,
  Presentation,
  School,
  UserRound,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { ClassroomHomework, LessonCourseware, SchoolClass, Student } from "@/types";
import { PresentationMode } from "./PresentationMode";

const CLASSROOM_KEY = "inteschool-classroom-id";
const DEFAULT_FONT_SIZE = 30;
const MIN_FONT_SIZE = 20;
const MAX_FONT_SIZE = 52;

type ClassroomTab = "homework" | "lesson";

interface ClassroomPreferences {
  subjectOrder: string[];
  hiddenSubjects: string[];
  fontSize: number;
}

interface HomeworkGroup {
  subject: string;
  items: ClassroomHomework[];
}

function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function preferencesKey(classId: string): string {
  return `inteschool-classroom-preferences:${classId}`;
}

function readPreferences(classId: string): ClassroomPreferences {
  const fallback: ClassroomPreferences = {
    subjectOrder: [],
    hiddenSubjects: [],
    fontSize: DEFAULT_FONT_SIZE,
  };
  if (!classId) return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem(preferencesKey(classId)) || "null") as Partial<ClassroomPreferences> | null;
    if (!stored) return fallback;
    return {
      subjectOrder: Array.isArray(stored.subjectOrder)
        ? stored.subjectOrder.filter((item): item is string => typeof item === "string")
        : [],
      hiddenSubjects: Array.isArray(stored.hiddenSubjects)
        ? stored.hiddenSubjects.filter((item): item is string => typeof item === "string")
        : [],
      fontSize: typeof stored.fontSize === "number"
        ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, stored.fontSize))
        : DEFAULT_FONT_SIZE,
    };
  } catch {
    return fallback;
  }
}

function SortableHomeworkCard({
  group,
  fontSize,
  onHide,
}: {
  group: HomeworkGroup;
  fontSize: number;
  onHide: (subject: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.subject });
  const teacherNames = [...new Set(group.items.map((item) => item.teacherName))];

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 30 : "auto",
      }}
      className={cn(
        "rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden min-h-56 flex flex-col",
        isDragging && "ring-2 ring-amber-400",
      )}
    >
      <header className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800 bg-neutral-900/80">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1.5 -ml-1 rounded-lg text-neutral-500 hover:text-amber-300 hover:bg-neutral-800 cursor-grab active:cursor-grabbing"
          title="拖拽调整学科顺序"
          aria-label={`拖拽调整${group.subject}作业顺序`}
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-amber-400 text-neutral-950 flex items-center justify-center font-bold text-lg">
          {group.subject.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-white">{group.subject}</h2>
          <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1.5">
            <UserRound className="w-3.5 h-3.5" />{teacherNames.join("、")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onHide(group.subject)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:border-neutral-500 hover:text-white"
        >
          <EyeOff className="w-4 h-4" />隐藏
        </button>
      </header>
      <div className="flex-1 px-6 py-5 space-y-5">
        {group.items.map((homework, index) => (
          <div key={homework.id} className={cn(index > 0 && "pt-5 border-t border-neutral-800")}>
            <div
              className="text-neutral-50 whitespace-pre-wrap leading-relaxed font-medium tracking-wide"
              style={{ fontSize: `${fontSize}px` }}
            >
              {homework.content}
            </div>
            {group.items.length > 1 && (
              <div className="text-xs text-neutral-500 mt-3">{homework.teacherName}</div>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

export default function ClassroomPage() {
  const { classId: routeClassId } = useParams<{ classId?: string }>();
  const navigate = useNavigate();
  const { teacher, logout } = useAuthStore();
  const [tab, setTab] = useState<ClassroomTab>("homework");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [lessons, setLessons] = useState<LessonCourseware[]>([]);
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [presenting, setPresenting] = useState<LessonCourseware | null>(null);
  const [preferences, setPreferences] = useState<ClassroomPreferences>(() => readPreferences(routeClassId || ""));
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const selectedClassId = routeClassId || sessionStorage.getItem(CLASSROOM_KEY) || "";
  const selectedClass = classes.find((item) => item.id === selectedClassId);
  const today = localDateValue();

  const savePreferences = useCallback((next: ClassroomPreferences) => {
    setPreferences(next);
    if (selectedClassId) localStorage.setItem(preferencesKey(selectedClassId), JSON.stringify(next));
  }, [selectedClassId]);

  useEffect(() => {
    setPreferences(readPreferences(selectedClassId));
    setHiddenPanelOpen(false);
  }, [selectedClassId]);

  const loadClasses = useCallback(async () => {
    if (!teacher?.schoolId) return;
    const data = await classService.listSchoolClasses(teacher.schoolId);
    const active = data.filter((item) => item.status !== "graduated");
    setClasses(active);
    if (!active.some((item) => item.id === selectedClassId) && active[0]) {
      sessionStorage.setItem(CLASSROOM_KEY, active[0].id);
      navigate(`/classroom/${active[0].id}`, { replace: true });
    }
  }, [navigate, selectedClassId, teacher?.schoolId]);

  const loadClassroomContent = useCallback(async (silent = false) => {
    if (!teacher?.schoolId || !selectedClassId) {
      setLessons([]);
      setHomeworks([]);
      setStudents([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [lessonData, studentData, homeworkData] = await Promise.all([
        lessonCoursewareService.listCoursewares({
          schoolId: teacher.schoolId,
          classId: selectedClassId,
          status: "published",
        }),
        classService.listStudentsByClass(selectedClassId),
        classroomHomeworkService.listHomeworks({
          schoolId: teacher.schoolId,
          classId: selectedClassId,
          assignedDate: today,
          publishedOnly: true,
        }),
      ]);
      setLessons(lessonData);
      setStudents(studentData);
      setHomeworks(homeworkData);
    } catch (error) {
      if (!silent) toast.error("教室内容加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedClassId, teacher?.schoolId, today]);

  useEffect(() => {
    void loadClasses().catch((error) => toast.error("班级加载失败", error instanceof Error ? error.message : undefined));
  }, [loadClasses]);

  useEffect(() => {
    void loadClassroomContent();
    const timer = window.setInterval(() => void loadClassroomContent(true), 60_000);
    return () => window.clearInterval(timer);
  }, [loadClassroomContent]);

  const homeworkGroups = useMemo<HomeworkGroup[]>(() => {
    const grouped = new Map<string, ClassroomHomework[]>();
    for (const homework of homeworks) {
      const subject = homework.subject || "其他学科";
      grouped.set(subject, [...(grouped.get(subject) || []), homework]);
    }
    const subjects = [...grouped.keys()];
    const orderedSubjects = [
      ...preferences.subjectOrder.filter((subject) => grouped.has(subject)),
      ...subjects
        .filter((subject) => !preferences.subjectOrder.includes(subject))
        .sort((a, b) => a.localeCompare(b, "zh-CN")),
    ];
    return orderedSubjects.map((subject) => ({ subject, items: grouped.get(subject) || [] }));
  }, [homeworks, preferences.subjectOrder]);

  const visibleHomeworkGroups = homeworkGroups.filter(
    (group) => !preferences.hiddenSubjects.includes(group.subject),
  );
  const hiddenHomeworkGroups = homeworkGroups.filter(
    (group) => preferences.hiddenSubjects.includes(group.subject),
  );

  const lessonGroups = useMemo(() => {
    const grouped = new Map<string, LessonCourseware[]>();
    for (const lesson of lessons) {
      const subject = lesson.subject || "其他学科";
      grouped.set(subject, [...(grouped.get(subject) || []), lesson]);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));
  }, [lessons]);

  const handleClassChange = (classId: string) => {
    sessionStorage.setItem(CLASSROOM_KEY, classId);
    navigate(`/classroom/${classId}`);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const fullOrder = homeworkGroups.map((group) => group.subject);
    const from = fullOrder.indexOf(String(active.id));
    const to = fullOrder.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    savePreferences({ ...preferences, subjectOrder: arrayMove(fullOrder, from, to) });
  };

  const hideSubject = (subject: string) => {
    savePreferences({
      ...preferences,
      hiddenSubjects: [...new Set([...preferences.hiddenSubjects, subject])],
    });
  };

  const restoreSubject = (subject: string) => {
    savePreferences({
      ...preferences,
      hiddenSubjects: preferences.hiddenSubjects.filter((item) => item !== subject),
    });
  };

  const changeFontSize = (delta: number) => {
    savePreferences({
      ...preferences,
      fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, preferences.fontSize + delta)),
    });
  };

  const handleExit = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  if (presenting) {
    return (
      <PresentationMode
        slides={presenting.slides}
        initialIndex={0}
        students={students}
        relatedQuestionsById={{}}
        onExit={() => setPresenting(null)}
      />
    );
  }

  return (
    <div className="h-screen min-h-[560px] bg-black text-white flex overflow-hidden">
      <aside className="w-44 lg:w-52 flex-shrink-0 border-r border-neutral-800 bg-neutral-950 flex flex-col">
        <div className="h-20 px-4 flex items-center gap-3 border-b border-neutral-800">
          <BrandMark className="w-10 h-10" />
          <div className="min-w-0">
            <div className="font-serif text-lg font-semibold truncate">我要上课</div>
            <div className="text-[10px] tracking-widest text-neutral-500">CLASSROOM</div>
          </div>
        </div>

        <div className="px-3 py-4 border-b border-neutral-800">
          <label htmlFor="classroom-class" className="text-[11px] text-neutral-500 block mb-2">当前班级</label>
          <div className="relative">
            <School className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              id="classroom-class"
              value={selectedClassId}
              onChange={(event) => handleClassChange(event.target.value)}
              className="w-full appearance-none rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 pl-9 pr-7 text-sm text-white outline-none focus:border-amber-400"
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>{item.grade} · {item.name}</option>
              ))}
            </select>
            <ChevronRight className="w-4 h-4 rotate-90 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {selectedClass && (
            <div className="text-[11px] text-neutral-500 mt-2">{students.length} 名学生</div>
          )}
        </div>

        <nav className="p-3 space-y-2">
          <button
            type="button"
            onClick={() => setTab("homework")}
            className={cn(
              "w-full rounded-xl px-3 py-3 flex items-center gap-3 text-sm transition-colors",
              tab === "homework" ? "bg-amber-400 text-neutral-950 font-semibold" : "text-neutral-300 hover:bg-neutral-900",
            )}
          >
            <ClipboardList className="w-5 h-5" />
            <span>作业</span>
            {homeworks.length > 0 && (
              <span className={cn("ml-auto text-xs", tab === "homework" ? "text-neutral-700" : "text-neutral-500")}>{homeworkGroups.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("lesson")}
            className={cn(
              "w-full rounded-xl px-3 py-3 flex items-center gap-3 text-sm transition-colors",
              tab === "lesson" ? "bg-amber-400 text-neutral-950 font-semibold" : "text-neutral-300 hover:bg-neutral-900",
            )}
          >
            <Presentation className="w-5 h-5" />
            <span>上课</span>
            {lessons.length > 0 && (
              <span className={cn("ml-auto text-xs", tab === "lesson" ? "text-neutral-700" : "text-neutral-500")}>{lessons.length}</span>
            )}
          </button>
        </nav>

        <div className="mt-auto p-3 border-t border-neutral-800">
          <button
            type="button"
            onClick={() => void handleExit()}
            className="w-full rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-white"
          >
            <LogOut className="w-4 h-4" />退出教室
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 flex flex-col bg-neutral-950">
        <header className="h-20 flex-shrink-0 px-6 lg:px-8 border-b border-neutral-800 flex items-center gap-4 bg-neutral-950/95">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{tab === "homework" ? "今日作业" : "上课课件"}</h1>
            <div className="text-xs text-neutral-500 mt-1 flex items-center gap-1.5">
              {tab === "homework" ? <CalendarDays className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
              {tab === "homework" ? today : "各学科教师已推送的课件"}
            </div>
          </div>
          {tab === "homework" && (
            <div className="ml-auto flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-1.5">
              <button
                type="button"
                aria-label="缩小作业字体"
                disabled={preferences.fontSize <= MIN_FONT_SIZE}
                onClick={() => changeFontSize(-2)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-14 text-center text-xs text-neutral-400">{preferences.fontSize}px</span>
              <button
                type="button"
                aria-label="放大作业字体"
                disabled={preferences.fontSize >= MAX_FONT_SIZE}
                onClick={() => changeFontSize(2)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        <div className="relative flex-1 overflow-y-auto p-5 lg:p-8 bg-black">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Spinner size={34} /></div>
          ) : classes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-500">当前学校尚未创建可用班级。</div>
          ) : tab === "homework" ? (
            homeworkGroups.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <ClipboardList className="w-16 h-16 text-neutral-800 mb-4" />
                <div className="text-xl text-neutral-300">今天还没有作业</div>
                <div className="text-sm text-neutral-600 mt-2">任课教师发布后会自动显示在这里。</div>
              </div>
            ) : visibleHomeworkGroups.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <EyeOff className="w-16 h-16 text-neutral-800 mb-4" />
                <div className="text-xl text-neutral-300">今天的作业已全部隐藏</div>
                <div className="text-sm text-neutral-600 mt-2">可从右下角恢复查看。</div>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={visibleHomeworkGroups.map((group) => group.subject)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 pb-20">
                    {visibleHomeworkGroups.map((group) => (
                      <SortableHomeworkCard
                        key={group.subject}
                        group={group}
                        fontSize={preferences.fontSize}
                        onHide={hideSubject}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )
          ) : lessons.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Presentation className="w-16 h-16 text-neutral-800 mb-4" />
              <div className="text-xl text-neutral-300">该班级暂无已发布课件</div>
              <div className="text-sm text-neutral-600 mt-2">教师可在“我的上课”中选择班级并发布。</div>
            </div>
          ) : (
            <div className="space-y-8">
              {lessonGroups.map(([subject, items]) => (
                <section key={subject}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-amber-400 text-neutral-950 flex items-center justify-center font-bold">{subject.slice(0, 1)}</div>
                    <div>
                      <h2 className="text-xl font-semibold">{subject}</h2>
                      <div className="text-xs text-neutral-500">{items.length} 份课件</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {items.map((lesson) => (
                      <button
                        type="button"
                        key={lesson.id}
                        onClick={() => setPresenting(lesson)}
                        className="text-left rounded-2xl border border-neutral-800 bg-neutral-950 p-5 hover:border-amber-400/70 hover:bg-neutral-900 transition-colors group"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center group-hover:bg-amber-400 group-hover:text-neutral-950">
                            <Play className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-lg font-medium text-white line-clamp-2">{lesson.title}</div>
                            <div className="flex items-center gap-4 text-xs text-neutral-500 mt-3 flex-wrap">
                              <span className="inline-flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{lesson.teacherName || "任课教师"}</span>
                              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{lesson.slides.length} 页</span>
                            </div>
                          </div>
                        </div>
                        {lesson.description && <p className="text-sm text-neutral-500 mt-4 line-clamp-2">{lesson.description}</p>}
                        <div className="mt-5 flex items-center justify-end gap-1 text-sm text-amber-300">
                          全屏上课<ChevronRight className="w-4 h-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {tab === "homework" && hiddenHomeworkGroups.length > 0 && (
            <button
              type="button"
              onClick={() => setHiddenPanelOpen(true)}
              className="fixed right-5 bottom-5 lg:right-8 lg:bottom-8 z-20 rounded-full bg-amber-400 text-neutral-950 shadow-2xl px-5 py-3 flex items-center gap-2 text-sm font-semibold hover:bg-amber-300"
            >
              <Eye className="w-4 h-4" />继续查看
              <span className="rounded-full bg-neutral-950/15 px-2 py-0.5 text-xs">{hiddenHomeworkGroups.length}</span>
            </button>
          )}
        </div>
      </main>

      {hiddenPanelOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-end" onClick={() => setHiddenPanelOpen(false)}>
          <section
            className="w-full max-w-lg max-h-[75vh] overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-t-3xl lg:rounded-3xl lg:m-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 bg-neutral-950 border-b border-neutral-800 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">已隐藏的作业</h2>
                <p className="text-xs text-neutral-500 mt-1">恢复后会重新出现在今日作业列表。</p>
              </div>
              <button type="button" onClick={() => setHiddenPanelOpen(false)} className="text-sm text-neutral-400 hover:text-white">关闭</button>
            </div>
            <div className="p-4 space-y-3">
              {hiddenHomeworkGroups.map((group) => (
                <button
                  type="button"
                  key={group.subject}
                  onClick={() => restoreSubject(group.subject)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4 flex items-center gap-3 text-left hover:border-amber-400"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-400 text-neutral-950 flex items-center justify-center font-bold">{group.subject.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white">{group.subject}</div>
                    <div className="text-xs text-neutral-500 mt-1 line-clamp-1">{group.items.map((item) => item.content).join("；")}</div>
                  </div>
                  <span className="text-xs text-amber-300">恢复显示</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

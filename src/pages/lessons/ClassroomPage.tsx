import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  LogOut,
  Maximize2,
  Megaphone,
  Minus,
  Minimize2,
  Play,
  Plus,
  Presentation,
  RotateCcw,
  School,
  UserRound,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { HomeworkAttachments } from "@/components/homework/HomeworkAttachments";
import { Spinner } from "@/components/ui/Spinner";
import { SUBJECT_OPTIONS } from "@/lib/education";
import { cn } from "@/lib/utils";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { classroomNoticeService } from "@/services/classroomNotice";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { ClassroomHomework, ClassroomNotice, LessonCourseware, SchoolClass, Student } from "@/types";
import { PresentationMode } from "./PresentationMode";

const CLASSROOM_KEY = "inteschool-classroom-id";
const DEFAULT_FONT_SIZE = 30;
const MIN_FONT_SIZE = 20;
const MAX_FONT_SIZE = 52;

type ClassroomTab = "homework" | "lesson";

interface ClassroomPreferences {
  subjectOrder: string[];
  lessonSubjectOrder: string[];
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
    lessonSubjectOrder: [],
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
      lessonSubjectOrder: Array.isArray(stored.lessonSubjectOrder)
        ? stored.lessonSubjectOrder.filter((item): item is string => typeof item === "string")
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

function HomeworkRow({
  group,
  fontSize,
  canMoveUp,
  canMoveDown,
  onComplete,
  onMove,
}: {
  group: HomeworkGroup;
  fontSize: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onComplete: (subject: string) => void;
  onMove: (subject: string, direction: -1 | 1) => void;
}) {
  return (
    <article className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.25rem] border-b border-neutral-800 last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)_5rem] lg:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem]">
      <header className="flex items-center justify-center border-r border-neutral-800 bg-amber-400 px-1 py-3 text-neutral-950">
        <h2 className="flex flex-col items-center gap-1 text-base font-bold sm:text-lg" aria-label={group.subject}>
          {Array.from(group.subject).map((character, index) => (
            <span key={`${character}-${index}`} aria-hidden="true">{character}</span>
          ))}
        </h2>
      </header>

      <div className="min-w-0 bg-neutral-950 px-4 py-3 sm:px-5 sm:py-4">
        <div className="space-y-5">
          {group.items.map((homework, index) => (
            <div key={homework.id} className={cn(index > 0 && "border-t border-neutral-800 pt-5")}>
              {homework.content && (
                <div
                  className="whitespace-pre-wrap font-medium leading-relaxed tracking-wide text-neutral-50"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {homework.content}
                </div>
              )}
              <HomeworkAttachments
                attachments={homework.attachments}
                theme="dark"
                className={cn(homework.content && "mt-4")}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-stretch justify-center gap-1.5 border-l border-neutral-800 bg-neutral-900/70 p-1.5 sm:p-2">
        <button
          type="button"
          onClick={() => onComplete(group.subject)}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-800/70 bg-emerald-950/40 px-1 text-[10px] font-medium text-emerald-300 hover:border-emerald-500 hover:bg-emerald-950/70"
          aria-label={`将${group.subject}作业标记为已完成`}
        >
          <Check className="h-4 w-4" />
          已完成
        </button>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onMove(group.subject, -1)}
            disabled={!canMoveUp}
            className="flex h-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 hover:border-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`${group.subject}作业上移`}
            title="上移"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(group.subject, 1)}
            disabled={!canMoveDown}
            className="flex h-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 hover:border-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`${group.subject}作业下移`}
            title="下移"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function lessonSubject(lesson: LessonCourseware): string {
  return lesson.subject?.trim() || "其他";
}

function LessonCard({ lesson, onOpen }: { lesson: LessonCourseware; onOpen: (lesson: LessonCourseware) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(lesson)}
      className="group rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-left transition-colors hover:border-amber-400/70 hover:bg-neutral-900"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 group-hover:bg-amber-400 group-hover:text-neutral-950">
          <Play className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-lg font-medium text-white">{lesson.title}</div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{lesson.teacherName || "任课教师"}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{lesson.slides.length} 页</span>
          </div>
        </div>
      </div>
      {lesson.description && <p className="mt-4 line-clamp-2 text-sm text-neutral-500">{lesson.description}</p>}
      <div className="mt-5 flex items-center justify-end gap-1 text-sm text-amber-300">
        全屏上课<ChevronRight className="h-4 w-4" />
      </div>
    </button>
  );
}

export default function ClassroomPage() {
  const classroomRootRef = useRef<HTMLDivElement>(null);
  const { classId: routeClassId } = useParams<{ classId?: string }>();
  const navigate = useNavigate();
  const { teacher, logout } = useAuthStore();
  const [tab, setTab] = useState<ClassroomTab>("homework");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [lessons, setLessons] = useState<LessonCourseware[]>([]);
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [notices, setNotices] = useState<ClassroomNotice[]>([]);
  const [historyHomeworks, setHistoryHomeworks] = useState<ClassroomHomework[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [allLessonsOpen, setAllLessonsOpen] = useState(false);
  const [selectedLessonSubject, setSelectedLessonSubject] = useState("");
  const [presenting, setPresenting] = useState<LessonCourseware | null>(null);
  const [preferences, setPreferences] = useState<ClassroomPreferences>(() => readPreferences(routeClassId || ""));
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

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
    setHistoryOpen(false);
    setAllLessonsOpen(false);
    setSelectedLessonSubject("");
    setHistoryHomeworks([]);
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
      setNotices([]);
      setStudents([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [lessonData, studentData, homeworkData, noticeData] = await Promise.all([
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
        classroomNoticeService.listNotices({
          schoolId: teacher.schoolId,
          classId: selectedClassId,
          activeOnly: true,
        }),
      ]);
      setLessons(lessonData);
      setStudents(studentData);
      setHomeworks(homeworkData);
      setNotices(noticeData);
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

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

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

  const lessonsBySubject = useMemo(() => {
    const grouped = new Map<string, LessonCourseware[]>();
    for (const lesson of lessons) {
      const subject = lessonSubject(lesson);
      grouped.set(subject, [...(grouped.get(subject) || []), lesson]);
    }
    return grouped;
  }, [lessons]);

  const lessonSubjects = useMemo(() => {
    const availableSubjects = [...new Set([...SUBJECT_OPTIONS, ...lessonsBySubject.keys()])];
    return [
      ...preferences.lessonSubjectOrder.filter((subject) => availableSubjects.includes(subject)),
      ...availableSubjects.filter((subject) => !preferences.lessonSubjectOrder.includes(subject)),
    ];
  }, [lessonsBySubject, preferences.lessonSubjectOrder]);

  useEffect(() => {
    if (!selectedLessonSubject && loading) return;
    if (selectedLessonSubject && lessonSubjects.includes(selectedLessonSubject)) return;
    setSelectedLessonSubject(
      lessonSubjects.find((subject) => (lessonsBySubject.get(subject)?.length || 0) > 0)
        || lessonSubjects[0]
        || "",
    );
  }, [lessonSubjects, lessonsBySubject, loading, selectedLessonSubject]);

  const selectedLessons = lessonsBySubject.get(selectedLessonSubject) || [];
  const allLessonGroups = lessonSubjects
    .map((subject) => [subject, lessonsBySubject.get(subject) || []] as const)
    .filter(([, items]) => items.length > 0);

  const handleClassChange = (classId: string) => {
    sessionStorage.setItem(CLASSROOM_KEY, classId);
    navigate(`/classroom/${classId}`);
  };

  const moveSubject = (subject: string, direction: -1 | 1) => {
    const visibleOrder = visibleHomeworkGroups.map((group) => group.subject);
    const visibleFrom = visibleOrder.indexOf(subject);
    const visibleTo = visibleFrom + direction;
    if (visibleFrom < 0 || visibleTo < 0 || visibleTo >= visibleOrder.length) return;

    const fullOrder = homeworkGroups.map((group) => group.subject);
    const from = fullOrder.indexOf(subject);
    const to = fullOrder.indexOf(visibleOrder[visibleTo]);
    if (from < 0 || to < 0) return;
    const nextOrder = [...fullOrder];
    [nextOrder[from], nextOrder[to]] = [nextOrder[to], nextOrder[from]];
    savePreferences({ ...preferences, subjectOrder: nextOrder });
  };

  const moveLessonSubject = (subject: string, direction: -1 | 1) => {
    const from = lessonSubjects.indexOf(subject);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= lessonSubjects.length) return;
    const nextOrder = [...lessonSubjects];
    [nextOrder[from], nextOrder[to]] = [nextOrder[to], nextOrder[from]];
    savePreferences({ ...preferences, lessonSubjectOrder: nextOrder });
  };

  const completeSubject = (subject: string) => {
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

  const openHomeworkHistory = async () => {
    setHistoryOpen(true);
    if (!teacher?.schoolId || !selectedClassId || historyHomeworks.length > 0) return;
    setHistoryLoading(true);
    try {
      const data = await classroomHomeworkService.listHomeworks({
        schoolId: teacher.schoolId,
        classId: selectedClassId,
        publishedOnly: true,
      });
      setHistoryHomeworks(
        data
          .filter((item) => item.assignedDate < today)
          .sort((left, right) => right.assignedDate.localeCompare(left.assignedDate)
            || right.publishAt.localeCompare(left.publishAt)),
      );
    } catch (error) {
      toast.error("往期作业加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setHistoryLoading(false);
    }
  };

  const historyGroups = useMemo(() => {
    const grouped = new Map<string, ClassroomHomework[]>();
    for (const homework of historyHomeworks) {
      grouped.set(homework.assignedDate, [...(grouped.get(homework.assignedDate) || []), homework]);
    }
    return [...grouped.entries()];
  }, [historyHomeworks]);

  const handleExit = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await classroomRootRef.current?.requestFullscreen();
      }
    } catch (error) {
      toast.error("全屏切换失败", error instanceof Error ? error.message : undefined);
    }
  };

  const openLesson = (lesson: LessonCourseware) => {
    setAllLessonsOpen(false);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
    setPresenting(lesson);
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
    <div ref={classroomRootRef} className="flex h-screen min-h-[560px] overflow-hidden bg-black text-white">
      <aside className="flex w-[4.75rem] flex-shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 sm:w-20 lg:w-24">
        <div className="border-b border-neutral-800 p-2">
          <div className="mb-1.5 flex items-center justify-center gap-1.5">
            <BrandMark className="h-6 w-6 flex-shrink-0" />
            <label htmlFor="classroom-class" className="whitespace-nowrap text-[9px] text-neutral-500">
              当前班级
            </label>
          </div>
          <div className="relative">
            <School className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-400" />
            <select
              id="classroom-class"
              value={selectedClassId}
              onChange={(event) => handleClassChange(event.target.value)}
              className="w-full appearance-none rounded-md border border-neutral-700 bg-neutral-900 py-1.5 pl-5 pr-3 text-[9px] text-white outline-none focus:border-amber-400 sm:text-[10px]"
              title={selectedClass ? `${selectedClass.grade} · ${selectedClass.name}` : "选择班级"}
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>{item.grade} · {item.name}</option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-0.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-neutral-500" />
          </div>
        </div>

        <nav className="grid min-h-0 flex-1 grid-rows-2 gap-2 p-2">
          <button
            type="button"
            onClick={() => setTab("homework")}
            className={cn(
              "flex min-h-0 flex-col items-center justify-center gap-2 rounded-xl px-1 py-3 text-xs transition-colors",
              tab === "homework"
                ? "bg-amber-400 font-semibold text-neutral-950"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white",
            )}
            aria-label={`作业${homeworkGroups.length > 0 ? `，${homeworkGroups.length}个学科` : ""}`}
          >
            <ClipboardList className="h-4 w-4" />
            <span className="flex flex-col items-center gap-1" aria-hidden="true">
              <span>作</span>
              <span>业</span>
            </span>
            {homeworkGroups.length > 0 && <span className="text-[9px] opacity-60">{homeworkGroups.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => setTab("lesson")}
            className={cn(
              "flex min-h-0 flex-col items-center justify-center gap-2 rounded-xl px-1 py-3 text-xs transition-colors",
              tab === "lesson"
                ? "bg-amber-400 font-semibold text-neutral-950"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white",
            )}
            aria-label={`上课${lessons.length > 0 ? `，${lessons.length}份课件` : ""}`}
          >
            <Presentation className="h-4 w-4" />
            <span className="flex flex-col items-center gap-1" aria-hidden="true">
              <span>上</span>
              <span>课</span>
            </span>
            {lessons.length > 0 && <span className="text-[9px] opacity-60">{lessons.length}</span>}
          </button>
        </nav>

        <div className="space-y-1 border-t border-neutral-800 p-2">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg text-[9px] text-neutral-400 hover:bg-neutral-900 hover:text-white"
            aria-label={isFullscreen ? "退出全屏" : "全屏"}
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span>{isFullscreen ? "退出全屏" : "全屏"}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExit()}
            className="flex h-9 w-full items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-900 hover:text-white"
            aria-label="退出教室"
            title="退出教室"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-neutral-950">
        {tab !== "lesson" && notices.length > 0 && (
          <div
            role="status"
            aria-label="班级通知"
            className="flex h-11 flex-shrink-0 items-center gap-3 overflow-hidden border-b border-amber-400/40 bg-black px-4 text-amber-300"
          >
            <Megaphone className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
              <div className="classroom-notice-track flex w-max font-semibold">
                {[0, 1].map((copyIndex) => (
                  <span
                    key={copyIndex}
                    aria-hidden={copyIndex === 1}
                    className="flex shrink-0 items-center pr-12"
                  >
                    {notices.map((notice, noticeIndex) => (
                      <span key={`${copyIndex}-${notice.id}`} className="flex shrink-0 items-center">
                        {noticeIndex > 0 && <span className="px-8 text-amber-500">◆</span>}
                        <span>{notice.content}</span>
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-950/95 px-4 lg:px-5">
          <div className="min-w-0">
            <h1 className="text-base font-semibold sm:text-lg">{tab === "homework" ? "今日作业" : "上课课件"}</h1>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
              {tab === "homework" ? <CalendarDays className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
              {tab === "homework" ? today : "各学科教师已推送的课件"}
            </div>
          </div>
        </header>

        <div className={cn(
          "relative flex-1 bg-black",
          tab === "lesson" ? "min-h-0 overflow-hidden" : "overflow-y-auto p-3 sm:p-4 lg:p-5",
        )}>
          {loading ? (
            <div className="flex h-full items-center justify-center"><Spinner size={34} /></div>
          ) : classes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-neutral-500">当前学校尚未创建可用班级。</div>
          ) : tab === "homework" ? (
            homeworkGroups.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <ClipboardList className="mb-4 h-14 w-14 text-neutral-800" />
                <div className="text-lg text-neutral-300">今天还没有作业</div>
                <div className="mt-2 text-xs text-neutral-600">任课教师发布后会自动显示在这里。</div>
              </div>
            ) : visibleHomeworkGroups.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Check className="mb-4 h-14 w-14 text-emerald-900" />
                <div className="text-lg text-neutral-300">今天的作业已全部完成</div>
                <div className="mt-2 text-xs text-neutral-600">可从底部“已完成”中恢复查看。</div>
              </div>
            ) : (
              <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl">
                {visibleHomeworkGroups.map((group) => {
                  const visibleIndex = visibleHomeworkGroups.findIndex((item) => item.subject === group.subject);
                  return (
                    <HomeworkRow
                      key={group.subject}
                      group={group}
                      fontSize={preferences.fontSize}
                      canMoveUp={visibleIndex > 0}
                      canMoveDown={visibleIndex >= 0 && visibleIndex < visibleHomeworkGroups.length - 1}
                      onComplete={completeSubject}
                      onMove={moveSubject}
                    />
                  );
                })}
              </section>
            )
          ) : (
            <div className="flex h-full min-h-0">
              <aside className="flex w-28 flex-shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 sm:w-32 lg:w-36" aria-label="上课学科">
                <div className="border-b border-neutral-800 px-3 py-3">
                  <div className="text-xs font-semibold text-neutral-200">全部学科</div>
                  <div className="mt-1 text-[10px] text-neutral-600">选择并调整顺序</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {lessonSubjects.map((subject, index) => {
                    const count = lessonsBySubject.get(subject)?.length || 0;
                    const selected = selectedLessonSubject === subject;
                    return (
                      <div
                        key={subject}
                        className={cn(
                          "mb-1 grid grid-cols-[minmax(0,1fr)_1.5rem] overflow-hidden rounded-lg border transition-colors",
                          selected
                            ? "border-amber-400 bg-amber-400 text-neutral-950"
                            : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-white",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedLessonSubject(subject)}
                          className="min-w-0 px-2 py-2.5 text-left"
                          aria-label={`选择${subject}学科，${count}份课件`}
                        >
                          <span className="block truncate text-xs font-semibold sm:text-sm">{subject}</span>
                          <span className={cn("mt-0.5 block text-[9px]", selected ? "text-neutral-800/70" : "text-neutral-600")}>{count} 份</span>
                        </button>
                        <span className={cn("grid grid-rows-2 border-l", selected ? "border-neutral-950/20" : "border-neutral-800")}>
                          <button
                            type="button"
                            onClick={() => moveLessonSubject(subject, -1)}
                            disabled={index === 0}
                            className="flex items-center justify-center border-b border-inherit hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-25"
                            aria-label={`${subject}学科上移`}
                            title="上移"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLessonSubject(subject, 1)}
                            disabled={index === lessonSubjects.length - 1}
                            className="flex items-center justify-center hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-25"
                            aria-label={`${subject}学科下移`}
                            title="下移"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </aside>

              <section className="flex min-w-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
                  {selectedLessons.length === 0 ? (
                    <div className="flex h-full min-h-52 flex-col items-center justify-center text-center">
                      <BookOpen className="mb-3 h-11 w-11 text-neutral-800" />
                      <div className="text-sm text-neutral-400">该学科暂无已推送课件</div>
                      <div className="mt-1 text-xs text-neutral-600">可选择左侧其他学科，或查看全部课件。</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      {selectedLessons.map((lesson) => (
                        <LessonCard key={lesson.id} lesson={lesson} onOpen={openLesson} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-shrink-0 justify-end border-t border-neutral-800 bg-neutral-950 px-4 py-2.5 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setAllLessonsOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-700 px-3 text-xs text-neutral-300 hover:border-amber-400 hover:text-amber-300"
                  >
                    更多课件
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>

        {tab === "homework" && (
          <footer className="flex min-h-12 flex-shrink-0 items-center gap-2 border-t border-neutral-800 bg-neutral-950 px-2 py-1.5 sm:px-3">
            <button
              type="button"
              onClick={() => void openHomeworkHistory()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 text-[10px] text-neutral-300 hover:border-amber-400 hover:text-amber-300 sm:text-xs"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              往期作业查看
            </button>

            {hiddenHomeworkGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setHiddenPanelOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-2.5 text-[10px] text-emerald-300 hover:border-emerald-500 sm:text-xs"
              >
                <Eye className="h-3.5 w-3.5" />
                已完成 {hiddenHomeworkGroups.length}
              </button>
            )}

            <div className="ml-auto flex h-8 items-center rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
              <button
                type="button"
                aria-label="缩小作业字体"
                disabled={preferences.fontSize <= MIN_FONT_SIZE}
                onClick={() => changeFontSize(-2)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center text-[9px] text-neutral-500 sm:w-12 sm:text-[10px]">{preferences.fontSize}px</span>
              <button
                type="button"
                aria-label="放大作业字体"
                disabled={preferences.fontSize >= MAX_FONT_SIZE}
                onClick={() => changeFontSize(2)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        )}
      </main>

      {allLessonsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/70" onClick={() => setAllLessonsOpen(false)}>
          <section
            className="max-h-[88vh] w-full max-w-6xl overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 shadow-2xl lg:m-6 lg:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">全部上课课件</h2>
                <p className="mt-1 text-xs text-neutral-500">该班级“我的上课”中已经发布的全部课件。</p>
              </div>
              <button type="button" onClick={() => setAllLessonsOpen(false)} className="text-sm text-neutral-400 hover:text-white">关闭</button>
            </div>
            <div className="space-y-7 p-4 sm:p-5">
              {allLessonGroups.length === 0 ? (
                <div className="py-16 text-center text-sm text-neutral-500">该班级暂无已发布课件。</div>
              ) : allLessonGroups.map(([subject, items]) => (
                <section key={subject}>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 font-bold text-neutral-950">{subject.slice(0, 1)}</div>
                    <div>
                      <h3 className="font-semibold text-white">{subject}</h3>
                      <div className="text-[10px] text-neutral-500">{items.length} 份课件</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {items.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} onOpen={openLesson} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      )}

      {hiddenPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/70" onClick={() => setHiddenPanelOpen(false)}>
          <section
            className="max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 shadow-2xl lg:m-6 lg:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">已完成的作业</h2>
                <p className="mt-1 text-xs text-neutral-500">恢复后会重新出现在今日作业列表。</p>
              </div>
              <button type="button" onClick={() => setHiddenPanelOpen(false)} className="text-sm text-neutral-400 hover:text-white">关闭</button>
            </div>
            <div className="space-y-3 p-4">
              {hiddenHomeworkGroups.map((group) => (
                <button
                  type="button"
                  key={group.subject}
                  onClick={() => restoreSubject(group.subject)}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4 text-left hover:border-amber-400"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 font-bold text-neutral-950">{group.subject.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white">{group.subject}</div>
                    <div className="mt-1 line-clamp-1 text-xs text-neutral-500">
                      {group.items.map((item) => item.content).filter(Boolean).join("；")
                        || `包含 ${group.items.reduce((count, item) => count + (item.attachments?.length || 0), 0)} 个附件`}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-amber-300"><RotateCcw className="h-3.5 w-3.5" />恢复</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/70" onClick={() => setHistoryOpen(false)}>
          <section
            className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 shadow-2xl lg:m-6 lg:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">往期作业</h2>
                <p className="mt-1 text-xs text-neutral-500">按日期查看该班级已经发布的作业。</p>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} className="text-sm text-neutral-400 hover:text-white">关闭</button>
            </div>
            <div className="p-4 sm:p-5">
              {historyLoading ? (
                <div className="flex min-h-40 items-center justify-center"><Spinner size={28} /></div>
              ) : historyGroups.length === 0 ? (
                <div className="py-16 text-center text-sm text-neutral-500">暂无往期作业。</div>
              ) : (
                <div className="space-y-5">
                  {historyGroups.map(([date, items]) => (
                    <section key={date}>
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-neutral-400">
                        <CalendarDays className="h-3.5 w-3.5 text-amber-400" />
                        {date}
                      </div>
                      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
                        {items.map((homework) => (
                          <div key={homework.id} className="grid grid-cols-[4rem_minmax(0,1fr)] border-b border-neutral-800 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)]">
                            <div className="flex items-center justify-center border-r border-neutral-800 bg-neutral-900 px-2 py-4 text-xs font-semibold text-amber-300">
                              {homework.subject || "其他"}
                            </div>
                            <div className="min-w-0 px-4 py-4">
                              {homework.content && (
                                <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{homework.content}</div>
                              )}
                              <HomeworkAttachments
                                attachments={homework.attachments}
                                theme="dark"
                                className={cn(homework.content && "mt-3")}
                              />
                              <div className="mt-2 text-[10px] text-neutral-600">{homework.teacherName}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

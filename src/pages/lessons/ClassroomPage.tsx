import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BookOpen, Clock, Play, School, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { classService } from "@/services/class";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { LessonCourseware, SchoolClass, Student } from "@/types";
import { PresentationMode } from "./PresentationMode";

const CLASSROOM_KEY = "inteschool-classroom-id";

export default function ClassroomPage() {
  const { classId: routeClassId } = useParams<{ classId?: string }>();
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [lessons, setLessons] = useState<LessonCourseware[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [presenting, setPresenting] = useState<LessonCourseware | null>(null);

  const selectedClassId = routeClassId || sessionStorage.getItem(CLASSROOM_KEY) || "";
  const selectedClass = classes.find((item) => item.id === selectedClassId);

  const loadClasses = useCallback(async () => {
    if (!teacher?.schoolId) return;
    const data = await classService.listSchoolClasses(teacher.schoolId);
    const active = data.filter((item) => item.status !== "graduated");
    setClasses(active);
    const selectedIsAccessible = active.some((item) => item.id === selectedClassId);
    if (!selectedIsAccessible && active[0]) {
      sessionStorage.setItem(CLASSROOM_KEY, active[0].id);
      navigate(`/classroom/${active[0].id}`, { replace: true });
    }
  }, [navigate, selectedClassId, teacher?.schoolId]);

  const loadLessons = useCallback(async () => {
    if (!teacher?.schoolId || !selectedClassId) {
      setLessons([]);
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [lessonData, studentData] = await Promise.all([
        lessonCoursewareService.listCoursewares({
          schoolId: teacher.schoolId,
          classId: selectedClassId,
          status: "published",
        }),
        classService.listStudentsByClass(selectedClassId),
      ]);
      setLessons(lessonData);
      setStudents(studentData);
    } catch (error) {
      toast.error("上课课件加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, teacher?.schoolId]);

  useEffect(() => {
    loadClasses().catch((error) => toast.error("班级加载失败", error instanceof Error ? error.message : undefined));
  }, [loadClasses]);

  useEffect(() => {
    loadLessons();
  }, [loadLessons]);

  const groupedLessons = useMemo(() => {
    const groups = new Map<string, LessonCourseware[]>();
    for (const lesson of lessons) {
      const subject = lesson.subject || "其他学科";
      groups.set(subject, [...(groups.get(subject) || []), lesson]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
  }, [lessons]);

  const handleClassChange = (classId: string) => {
    sessionStorage.setItem(CLASSROOM_KEY, classId);
    navigate(`/classroom/${classId}`);
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
    <div>
      <PageHeader
        title="我要上课"
        description="选择班级后，集中查看该班所有学科已发布的上课课件"
        icon={<School className="w-5 h-5" />}
        action={
          <Select
            value={selectedClassId}
            onChange={(event) => handleClassChange(event.target.value)}
            options={classes.map((item) => ({ value: item.id, label: `${item.grade} · ${item.name}` }))}
            className="min-w-52"
          />
        }
      />

      {selectedClass && (
        <Card className="p-4 mb-4 flex items-center gap-4 flex-wrap">
          <div className="w-11 h-11 rounded-lg bg-gold-50 flex items-center justify-center">
            <School className="w-5 h-5 text-gold-700" />
          </div>
          <div>
            <div className="font-medium text-ink-900">{selectedClass.name}</div>
            <div className="text-xs text-ink-500 mt-0.5">{selectedClass.grade} · {students.length} 名学生</div>
          </div>
          <div className="ml-auto text-sm text-ink-500">已发布 {lessons.length} 份课件</div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={28} /></div>
      ) : classes.length === 0 ? (
        <Card className="p-12 text-center text-sm text-ink-500">当前学校尚未创建可用班级。</Card>
      ) : lessons.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto text-ink-200 mb-3" />
          <div className="font-medium text-ink-800">该班级暂无已发布课件</div>
          <div className="text-sm text-ink-500 mt-1">教师可在“我的上课”中选择班级并发布。</div>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedLessons.map(([subject, items]) => (
            <section key={subject}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-serif text-lg font-semibold text-ink-900">{subject}</h2>
                <Badge variant="ink">{items.length} 份</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((lesson) => (
                  <Card key={lesson.id} className="p-4 hover:shadow-cardHover transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gold-50 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-5 h-5 text-gold-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink-900 line-clamp-2">{lesson.title}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-ink-500 flex-wrap">
                          <span className="inline-flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{lesson.teacherName || "任课教师"}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{lesson.slides.length} 页</span>
                        </div>
                      </div>
                    </div>
                    {lesson.description && <p className="text-xs text-ink-500 mt-3 line-clamp-2">{lesson.description}</p>}
                    <Button variant="gold" className="w-full mt-4" onClick={() => setPresenting(lesson)}>
                      <Play className="w-4 h-4" />开始上课
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, BookOpen, Lock, Mail, School } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { classService } from "@/services/class";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomChoice } from "@/types";

const CLASSROOM_KEY = "inteschool-classroom-id";

export default function ClassroomLoginPage() {
  const navigate = useNavigate();
  const { teacher, login, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [classes, setClasses] = useState<ClassroomChoice[]>([]);
  const [classId, setClassId] = useState("");
  const [classLoading, setClassLoading] = useState(true);
  const [classError, setClassError] = useState("");

  useEffect(() => {
    classService.listClassroomChoices()
      .then((items) => {
        setClasses(items);
        const saved = sessionStorage.getItem(CLASSROOM_KEY);
        const initial = items.find((item) => item.id === saved)?.id || items[0]?.id || "";
        setClassId(initial);
      })
      .catch((cause) => setClassError(cause instanceof Error ? cause.message : "班级列表加载失败"))
      .finally(() => setClassLoading(false));
  }, []);

  const options = useMemo(
    () => classes.map((item) => ({
      value: item.id,
      label: `${item.schoolName} · ${item.grade} · ${item.name}`,
    })),
    [classes],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    if (!classId) return;
    let activeTeacher = teacher;
    if (!activeTeacher) {
      const ok = await login(email, password);
      if (!ok) return;
      activeTeacher = useAuthStore.getState().teacher;
    }
    const selectedClass = classes.find((item) => item.id === classId);
    if (!activeTeacher?.schoolId || selectedClass?.schoolId !== activeTeacher.schoolId) {
      const firstAccessibleClass = classes.find((item) => item.schoolId === activeTeacher?.schoolId);
      if (firstAccessibleClass) setClassId(firstAccessibleClass.id);
      setClassError("请选择当前学校的班级");
      return;
    }
    sessionStorage.setItem(CLASSROOM_KEY, classId);
    navigate(`/classroom/${classId}`);
  };

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-paper border border-ink-100 shadow-xl overflow-hidden">
        <div className="bg-ink-900 text-paper px-7 py-6">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="inline-flex items-center gap-1 text-xs text-ink-300 hover:text-paper mb-5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />教师工作台登录
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gold-400 text-ink-900 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold">我要上课</h1>
              <p className="text-sm text-ink-300 mt-1">一次登录并选择班级，查看全部学科课件</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-4">
          {!teacher && (
            <>
              <div className="relative">
                <Mail className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
                <Input
                  label="教师邮箱"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
                <Input
                  label="密码"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </>
          )}

          {teacher && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              已登录：{teacher.name}
            </div>
          )}

          <div className="relative">
            <School className="absolute left-3 top-9 w-4 h-4 text-ink-400 z-10" />
            <Select
              label="上课班级"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              options={options}
              className="pl-10"
              disabled={classLoading || options.length === 0}
            />
          </div>

          {classError && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{classError}</div>}
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            loading={loading || classLoading}
            disabled={!classId}
          >
            <BookOpen className="w-4 h-4" />进入班级课件
          </Button>
        </form>
      </div>
    </div>
  );
}

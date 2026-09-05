import { openPage } from "@/lib/navigation";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, BookOpen, MonitorCheck, School as SchoolIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { classService } from "@/services/class";
import {
  CLASSROOM_DEVICE_TOKEN_KEY,
  classroomDeviceService,
  classroomInstallationId,
  createClassroomDeviceToken,
} from "@/services/classroomDevice";
import { schoolService } from "@/services/school";
import type { ClassroomChoice, School } from "@/types";

const PUBLIC_CLASSROOM_VALUE = "__public_classroom__";

export default function ClassroomLoginPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassroomChoice[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [classId, setClassId] = useState("");
  const [choiceLoading, setChoiceLoading] = useState(true);
  const [formError, setFormError] = useState("");
  const [checkingBinding, setCheckingBinding] = useState(true);
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem(CLASSROOM_DEVICE_TOKEN_KEY);
    if (!token) {
      setCheckingBinding(false);
      return () => { active = false; };
    }
    classroomDeviceService.getDeviceSession(token)
      .then(() => {
        if (active) navigate("/classroom-device", { replace: true });
      })
      .catch(() => {
        localStorage.removeItem(CLASSROOM_DEVICE_TOKEN_KEY);
        if (active) setCheckingBinding(false);
      });
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    if (checkingBinding) return;
    let active = true;
    setChoiceLoading(true);
    Promise.all([
      schoolService.listSchools(),
      classService.listClassroomChoices(),
    ])
      .then(([schoolItems, classItems]) => {
        if (!active) return;
        setSchools(schoolItems);
        setClasses(classItems);
      })
      .catch((cause) => {
        if (active) setFormError(cause instanceof Error ? cause.message : "学校和班级列表加载失败");
      })
      .finally(() => {
        if (active) setChoiceLoading(false);
      });
    return () => { active = false; };
  }, [checkingBinding]);

  const schoolOptions = useMemo(
    () => schools.map((item) => ({
      value: item.id,
      label: item.city ? `${item.name} · ${item.city}` : item.name,
    })),
    [schools],
  );

  const schoolClasses = useMemo(
    () => classes.filter((item) => item.schoolId === schoolId),
    [classes, schoolId],
  );

  const classOptions = useMemo(
    () => schoolId && schoolClasses.length > 0 ? [
      { value: PUBLIC_CLASSROOM_VALUE, label: "公共教室" },
      ...schoolClasses.map((item) => ({
        value: item.id,
        label: `${item.grade} · ${item.name}`,
      })),
    ] : [],
    [schoolClasses, schoolId],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!schoolId) {
      setFormError("请选择学校");
      return;
    }
    if (!classId) {
      setFormError("请选择班级或公共教室");
      return;
    }

    setBinding(true);
    try {
      const deviceToken = createClassroomDeviceToken();
      await classroomDeviceService.bindDevice({
        schoolId,
        ...(classId === PUBLIC_CLASSROOM_VALUE
          ? { publicClassroom: true }
          : { classId }),
        deviceToken,
        installationId: classroomInstallationId(),
      });
      localStorage.setItem(CLASSROOM_DEVICE_TOKEN_KEY, deviceToken);
      navigate("/classroom-device", { replace: true });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "教室一体机绑定失败");
    } finally {
      setBinding(false);
    }
  };

  if (checkingBinding) {
    return (
      <div className="min-h-screen bg-mist flex flex-col items-center justify-center gap-3 text-sm text-ink-500">
        <Spinner size={30} />
        正在识别本教室一体机…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-paper border border-ink-100 shadow-xl overflow-hidden">
        <div className="bg-ink-900 text-paper px-7 py-6">
          <button
            type="button"
            onClick={() => openPage("/login")}
            className="inline-flex items-center gap-1 text-xs text-ink-300 hover:text-paper mb-5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />返回登录页
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gold-400 text-ink-900 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold">我要上课</h1>
              <p className="text-sm text-ink-300 mt-1">首次使用选择学校和班级完成绑定</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
            <div className="flex items-center gap-1.5 font-medium"><MonitorCheck className="h-4 w-4" />绑定后本机会直接进入上课首页</div>
            <p className="mt-1 text-amber-800">班级列表包含“公共教室”；公共教室进入后可切换本校班级。学校管理员可在“我的教室”中解绑设备。</p>
          </div>

          <div className="relative">
            <SchoolIcon className="absolute left-3 top-9 w-4 h-4 text-ink-400 z-10" />
            <Select
              label="学校"
              value={schoolId}
              onChange={(event) => {
                setSchoolId(event.target.value);
                setClassId("");
                setFormError("");
              }}
              options={schoolOptions}
              placeholder={choiceLoading ? "正在加载学校…" : "请选择学校"}
              className="pl-10"
              disabled={choiceLoading}
            />
          </div>

          <Select
            label="班级"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setFormError("");
            }}
            options={classOptions}
            placeholder={!schoolId ? "请先选择学校" : "请选择班级或公共教室"}
            disabled={choiceLoading || !schoolId}
          />

          {schoolId && !choiceLoading && schoolClasses.length === 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              该学校暂无可用班级，暂时无法绑定教室一体机。
            </div>
          )}
          {formError && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{formError}</div>}

          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            loading={binding}
            disabled={choiceLoading || !schoolId || !classId}
          >
            <MonitorCheck className="w-4 h-4" />绑定
          </Button>
        </form>
      </div>
    </div>
  );
}

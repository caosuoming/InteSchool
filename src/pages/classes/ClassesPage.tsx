import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  GraduationCap, Plus, Users, UserPlus, Trash2,
  School, Layers, ChevronRight, Pencil,
  Calendar, MoreVertical, ArrowRightLeft, PauseCircle,
  PlayCircle, Archive, ArrowLeft,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SchoolClass, PersonalClass, Student, AnyClass, ClassTypeCategory } from "@/types";
import { formatDate } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { includeCurrentOption, useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";

type Tab = "school" | "personal";

export default function ClassesPage({ personalOnly = false }: { personalOnly?: boolean }) {
  const navigate = useNavigate();
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const currentAffiliation = getCurrentAffiliation();
  const isPersonal = !currentAffiliation?.schoolId;
  const schoolId = currentAffiliation?.schoolId || null;
  const { gradeOptions, defaultGrade } = useSchoolResourceOptions(schoolId);
  const [tab, setTab] = useState<Tab>(isPersonal || personalOnly ? "personal" : "school");
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [personalClasses, setPersonalClasses] = useState<PersonalClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<AnyClass | null>(null);
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const classStudentIds = useMemo(
    () => new Set(classStudents.map((student) => student.id)),
    [classStudents],
  );
  const [showSuspended, setShowSuspended] = useState(false);
  const [suspendedStudents, setSuspendedStudents] = useState<Student[]>([]);
  const [showDeparted, setShowDeparted] = useState(false);
  const [departedStudents, setDepartedStudents] = useState<Student[]>([]);
  const [classActionMenuOpen, setClassActionMenuOpen] = useState(false);

  // 恢复学生弹窗
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumingStudent, setResumingStudent] = useState<Student | null>(null);
  const [resumeTargetClass, setResumeTargetClass] = useState("");

  // 创建班级
  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassGrade, setNewClassGrade] = useState("");
  const [newClassDesc, setNewClassDesc] = useState("");
  const [newClassType, setNewClassType] = useState("");
  const [newClassGradeYear, setNewClassGradeYear] = useState(String(new Date().getFullYear()));

  const [classTypes, setClassTypes] = useState<ClassTypeCategory[]>([]);

  // 编辑班级
  const [editClassOpen, setEditClassOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [editClassName, setEditClassName] = useState("");
  const [editClassGrade, setEditClassGrade] = useState("");
  const [editClassType, setEditClassType] = useState("");
  const [editClassGradeYear, setEditClassGradeYear] = useState("");

  // 添加学生
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentNo, setNewStudentNo] = useState("");
  const [newStudentGrade, setNewStudentGrade] = useState("");
  const [newStudentGender, setNewStudentGender] = useState<"male" | "female">("male");

  // 添加学生到个人班
  const [addToPersonalOpen, setAddToPersonalOpen] = useState(false);
  const [searchStudentKw, setSearchStudentKw] = useState("");
  const [addStudentTab, setAddStudentTab] = useState<"school" | "external">("school");
  const [extStudentName, setExtStudentName] = useState("");
  const [extStudentNo, setExtStudentNo] = useState("");
  const [extStudentGrade, setExtStudentGrade] = useState("");
  const [extStudentGender, setExtStudentGender] = useState<"male" | "female">("male");
  const [extStudentSchool, setExtStudentSchool] = useState("");

  // 编辑学生（含学号）
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentNo, setEditStudentNo] = useState("");
  const [editStudentGrade, setEditStudentGrade] = useState("");
  const [editStudentGender, setEditStudentGender] = useState<"male" | "female">("male");
  const [editStudentSchool, setEditStudentSchool] = useState("");

  // 换班
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [transferTargetClass, setTransferTargetClass] = useState("");
  const [transferNewStudentNo, setTransferNewStudentNo] = useState("");

  // 学生操作菜单
  const [actionMenuStudentId, setActionMenuStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!defaultGrade) return;
    setNewClassGrade((value) => value || defaultGrade);
    setNewStudentGrade((value) => value || defaultGrade);
    setExtStudentGrade((value) => value || defaultGrade);
  }, [defaultGrade]);

  useEffect(() => {
    if (isPersonal || personalOnly) setTab("personal");
  }, [isPersonal, personalOnly]);

  const load = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    const pc = await classService.listPersonalClasses(teacher.id);
    setPersonalClasses(pc);
    if (schoolId) {
      const [sc, sts, ct, susp, departed] = await Promise.all([
        classService.listSchoolClasses(schoolId),
        classService.listStudentsBySchool(schoolId),
        settingsService.listClassTypes(schoolId),
        classService.listSuspendedStudents(personalOnly ? teacher.id : schoolId, personalOnly ? "personal" : "school"),
        classService.listDepartedStudents(personalOnly ? teacher.id : schoolId, personalOnly ? "personal" : "school"),
      ]);
      setSchoolClasses(sc);
      setStudents(sts);
      setClassTypes(ct.filter((c) => c.enabled));
      setSuspendedStudents(susp);
      setDepartedStudents(departed);
    } else {
      const [susp, departed] = await Promise.all([
        classService.listSuspendedStudents(teacher.id, "personal"),
        classService.listDepartedStudents(teacher.id, "personal"),
      ]);
      setSchoolClasses([]);
      setStudents([]);
      setClassTypes([]);
      setSuspendedStudents(susp);
      setDepartedStudents(departed);
    }
    setLoading(false);
  }, [personalOnly, schoolId, teacher]);

  useEffect(() => {
    load();
  }, [load]);

  const loadClassStudents = async (cls: AnyClass) => {
    setSelectedClass(cls);
    setClassActionMenuOpen(false);
    const ss = await classService.listStudentsByClass(cls.id);
    setClassStudents(ss);
  };

  const handleCreateClass = async () => {
    if (!teacher) return;
    if (!newClassName.trim()) {
      toast.error("请填写班级名称");
      return;
    }
    if (tab === "school") {
      if (!schoolId) {
        toast.error("个人身份无法创建本校班级");
        return;
      }
      await classService.createSchoolClass(schoolId, teacher.id, newClassName, newClassGrade, {
        classTypeId: newClassType || undefined,
        gradeYear: newClassGradeYear ? Number(newClassGradeYear) : undefined,
      });
      toast.success("本校班级已创建");
    } else {
      await classService.createPersonalClass(teacher.id, newClassName, newClassDesc);
      toast.success("个人教学班已创建");
    }
    setCreateClassOpen(false);
    setNewClassName("");
    setNewClassDesc("");
    setNewClassType("");
    await load();
  };

  const openEditClass = (cls: SchoolClass) => {
    setEditingClass(cls);
    setEditClassName(cls.name);
    setEditClassGrade(cls.grade);
    setEditClassType(cls.classTypeId || "");
    setEditClassGradeYear(cls.gradeYear ? String(cls.gradeYear) : "");
    setEditClassOpen(true);
  };

  const handleEditClass = async () => {
    if (!editingClass) return;
    if (!editClassName.trim()) {
      toast.error("请填写班级名称");
      return;
    }
    await classService.updateSchoolClass(editingClass.id, {
      name: editClassName.trim(),
      grade: editClassGrade,
      classTypeId: editClassType || undefined,
      gradeYear: editClassGradeYear ? Number(editClassGradeYear) : undefined,
    });
    toast.success("班级信息已更新");
    setEditClassOpen(false);
    setEditingClass(null);
    await load();
  };

  const handleAddStudent = async () => {
    if (!teacher || !selectedClass) return;
    if (!newStudentName.trim() || !newStudentNo.trim()) {
      toast.error("请填写姓名与学号");
      return;
    }
    // 个人身份或个人教学班添加的学生标记为校外
    const isExternal = isPersonal || selectedClass.type === "personal";
    if (isExternal && !schoolId) {
      // 个人身份：使用 addExternalStudentToPersonalClass
      await classService.addExternalStudentToPersonalClass(selectedClass.id, {
        name: newStudentName,
        studentNo: newStudentNo,
        grade: newStudentGrade,
        gender: newStudentGender,
        externalSchool: currentAffiliation?.schoolName || "个人教学",
      });
    } else {
      await classService.addStudent(selectedClass.id, schoolId!, {
        name: newStudentName,
        studentNo: newStudentNo,
        grade: newStudentGrade,
        gender: newStudentGender,
      });
    }
    toast.success("学生已添加");
    setAddStudentOpen(false);
    setNewStudentName("");
    setNewStudentNo("");
    await load();
    if (selectedClass) await loadClassStudents(selectedClass);
  };

  const handleAddToPersonal = async (studentId: string) => {
    if (!selectedClass) return;
    await classService.addStudentToPersonalClass(selectedClass.id, studentId);
    toast.success("学生已加入教学班");
    await load();
    await loadClassStudents(selectedClass);
  };

  const handleAddExternalStudent = async () => {
    if (!selectedClass) return;
    if (!extStudentName.trim() || !extStudentNo.trim() || !extStudentSchool.trim()) {
      toast.error("请填写姓名、学号和学校名称");
      return;
    }
    await classService.addExternalStudentToPersonalClass(selectedClass.id, {
      name: extStudentName,
      studentNo: extStudentNo,
      grade: extStudentGrade,
      gender: extStudentGender,
      externalSchool: extStudentSchool,
    });
    toast.success("校外学生已添加");
    setExtStudentName("");
    setExtStudentNo("");
    setExtStudentSchool("");
    await load();
    await loadClassStudents(selectedClass);
  };

  const handleDeleteClass = async (cls: AnyClass) => {
    if (!confirm(`确定要删除「${cls.name}」吗？`)) return;
    await classService.deleteClass(cls.id, cls.type === "personal");
    toast.success("班级已删除");
    if (selectedClass?.id === cls.id) setSelectedClass(null);
    await load();
  };

  // 打开编辑学生弹窗
  const openEditStudent = (s: Student) => {
    setActionMenuStudentId(null);
    setEditingStudent(s);
    setEditStudentName(s.name);
    setEditStudentNo(s.studentNo || "");
    setEditStudentGrade(s.grade || defaultGrade);
    setEditStudentGender(s.gender || "male");
    setEditStudentSchool(s.externalSchool || "");
    setEditStudentOpen(true);
  };

  const handleEditStudent = async () => {
    if (!editingStudent) return;
    if (!editStudentName.trim() || !editStudentNo.trim()) {
      toast.error("请填写姓名与学号");
      return;
    }
    // 校验学号在本校唯一（排除自身）
    if (editingStudent.schoolId) {
      const allStudents = await classService.listStudentsBySchool(editingStudent.schoolId);
      const dup = allStudents.find(
        (s) => s.studentNo === editStudentNo.trim() && s.id !== editingStudent.id,
      );
      if (dup) {
        toast.error("学号已存在", `与「${dup.name}」学号冲突`);
        return;
      }
    }
    await classService.updateStudent(editingStudent.id, {
      name: editStudentName.trim(),
      studentNo: editStudentNo.trim(),
      grade: editStudentGrade,
      gender: editStudentGender,
      externalSchool: editingStudent.isExternal ? editStudentSchool.trim() : undefined,
    });
    toast.success("学生信息已更新");
    setEditStudentOpen(false);
    setEditingStudent(null);
    await load();
    if (selectedClass) await loadClassStudents(selectedClass);
  };

  const filteredStudents = students.filter(
    (s) =>
      s.status === "active"
      && (s.name.toLowerCase().includes(searchStudentKw.toLowerCase())
        || s.studentNo.toLowerCase().includes(searchStudentKw.toLowerCase())),
  );

  // 打开换班弹窗
  const openTransfer = (s: Student) => {
    setTransferringStudent(s);
    setTransferTargetClass("");
    setTransferNewStudentNo("");
    setTransferOpen(true);
    setActionMenuStudentId(null);
  };

  const handleTransfer = async () => {
    if (!transferringStudent || !transferTargetClass) {
      toast.error("请选择目标班级");
      return;
    }
    await classService.transferStudent(
      transferringStudent.id,
      transferTargetClass,
      transferNewStudentNo ? { newStudentNo: transferNewStudentNo } : undefined,
    );
    toast.success(`已将「${transferringStudent.name}」转入新班级，学情数据已保留`);
    setTransferOpen(false);
    setTransferringStudent(null);
    setTransferTargetClass("");
    setTransferNewStudentNo("");
    await load();
    if (selectedClass) await loadClassStudents(selectedClass);
  };

  const handleSuspend = async (s: Student) => {
    if (!window.confirm(`确定要挂起「${s.name}」吗？\n挂起后该学生将移入休学生收容所，所有学情数据保留，可随时恢复。`)) return;
    setActionMenuStudentId(null);
    try {
      await classService.suspendStudent(s.id);
      toast.success(`「${s.name}」已挂起，移入休学生收容所`);
      await load();
      if (selectedClass) await loadClassStudents(selectedClass);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "挂起失败");
    }
  };

  const handleGraduateStudent = async (student: Student) => {
    if (!window.confirm(`确定将「${student.name}」标记为提前毕业吗？\n该学生将从在读名单移入离校学生档案，历史学情数据会保留。`)) return;
    setActionMenuStudentId(null);
    try {
      await classService.graduateStudent(student.id);
      toast.success(`「${student.name}」已提前毕业`);
      await load();
      if (selectedClass) await loadClassStudents(selectedClass);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提前毕业失败");
    }
  };

  const handleTransferOut = async (student: Student) => {
    if (!window.confirm(`确定将「${student.name}」标记为转校吗？\n该学生将从在读名单移入离校学生档案，历史学情数据会保留。`)) return;
    setActionMenuStudentId(null);
    try {
      await classService.transferOutStudent(student.id);
      toast.success(`「${student.name}」已标记为转校`);
      await load();
      if (selectedClass) await loadClassStudents(selectedClass);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "转校操作失败");
    }
  };

  const handleGraduateClass = async () => {
    if (!selectedClass || selectedClass.type !== "school") return;
    const activeCount = classStudents.length;
    const message = activeCount > 0
      ? `确定让「${selectedClass.name}」整班毕业吗？\n当前 ${activeCount} 名在读学生将全部毕业，班级随后封存。历史学情数据会保留。`
      : `「${selectedClass.name}」当前没有在读学生。确定仍将该班级封存为已毕业吗？`;
    if (!window.confirm(message)) return;
    setClassActionMenuOpen(false);
    try {
      const result = await classService.graduateClass(selectedClass.id);
      setSelectedClass(result.class);
      setClassStudents([]);
      toast.success(`「${selectedClass.name}」已整班毕业`, `共处理 ${result.graduatedCount} 名学生`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "整班毕业失败");
    }
  };

  const openResume = (s: Student) => {
    const originalSchoolClass = schoolClasses.find((item) => item.id === s.classId);
    setResumingStudent(s);
    setResumeTargetClass(originalSchoolClass?.status === "graduated" ? "" : s.classId || "");
    setResumeOpen(true);
    setActionMenuStudentId(null);
  };

  const handleResume = async () => {
    if (!resumingStudent) return;
    if (!resumeTargetClass) {
      toast.error("请选择恢复到的班级");
      return;
    }
    try {
      await classService.resumeStudent(resumingStudent.id, resumeTargetClass);
      toast.success(`「${resumingStudent.name}」已恢复到班级`);
      setResumeOpen(false);
      setResumingStudent(null);
      setResumeTargetClass("");
      await load();
      if (selectedClass) await loadClassStudents(selectedClass);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败");
    }
  };

  return (
    <div>
      <PageHeader
        title={personalOnly ? "个人教学班" : "班级与学生"}
        description={
          personalOnly
            ? "管理教师私有的个人教学班和学生档案"
            : isPersonal
            ? "管理个人教学班级和学生档案（个人身份，学生为校外）"
            : "本校班级共享，每位教师都可维护；个人教学班为教师私有"
        }
        icon={<GraduationCap className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            {personalOnly && (
              <Button
                variant="outline"
                onClick={() => navigate("/admin/classes")}
                aria-label="返回班级与学生"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </Button>
            )}
            <Button variant="gold" onClick={() => setCreateClassOpen(true)}>
              <Plus className="w-4 h-4" />
              {isPersonal || personalOnly ? "新建教学班" : tab === "school" ? "新建班级" : "新建教学班"}
            </Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* 左：班级列表 */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            {!personalOnly && <div className="flex items-center gap-1 p-1 mb-3 rounded-md bg-ink-100">
              {!isPersonal && (
                <button
                  onClick={() => setTab("school")}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                    tab === "school" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-600",
                  )}
                >
                  <School className="w-3.5 h-3.5" />
                  本校班级 ({schoolClasses.length})
                </button>
              )}
              <button
                onClick={() => setTab("personal")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                  tab === "personal" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-600",
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                个人教学班 ({personalClasses.length})
              </button>
            </div>}

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : (
              <>
                <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {tab === "school"
                  ? schoolClasses.map((c) => {
                      const ct = classTypes.find((t) => t.id === c.classTypeId);
                      return (
                        <ClassListItem
                          key={c.id}
                          cls={c}
                          selected={selectedClass?.id === c.id && !showSuspended && !showDeparted}
                          onSelect={() => { setShowSuspended(false); setShowDeparted(false); loadClassStudents(c); }}
                          onDelete={() => handleDeleteClass(c)}
                          classTypeName={ct?.name}
                          classTypeColor={ct?.color}
                        />
                      );
                    })
                  : personalClasses.map((c) => (
                      <ClassListItem
                        key={c.id}
                        cls={c}
                        selected={selectedClass?.id === c.id && !showSuspended && !showDeparted}
                        onSelect={() => { setShowSuspended(false); setShowDeparted(false); loadClassStudents(c); }}
                        onDelete={() => handleDeleteClass(c)}
                      />
                    ))}
              </div>

              {/* 休学生收容所入口 */}
              {suspendedStudents.length > 0 && (
                <div className="mt-3 pt-3 border-t border-ink-100">
                  <button
                    onClick={() => {
                      setShowSuspended(true);
                      setShowDeparted(false);
                      setSelectedClass(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors",
                      showSuspended
                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "text-ink-600 hover:bg-ink-50",
                    )}
                  >
                    <PauseCircle className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">休学生收容所</div>
                      <div className="text-xs opacity-70">{suspendedStudents.length} 名学生挂起中</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                </div>
              )}
              {departedStudents.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => {
                      setShowDeparted(true);
                      setShowSuspended(false);
                      setSelectedClass(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors",
                      showDeparted
                        ? "bg-ink-100 text-ink-900 border border-ink-200"
                        : "text-ink-600 hover:bg-ink-50",
                    )}
                  >
                    <Archive className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">离校学生档案</div>
                      <div className="text-xs opacity-70">{departedStudents.length} 名学生已毕业或转校</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                </div>
              )}
              </>
            )}
          </Card>
        </div>

        {/* 右：班级详情与学生 */}
        <div className="lg:col-span-2">
          {showSuspended ? (
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-50 text-amber-600">
                    <PauseCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-xl font-bold text-ink-900">休学生收容所</h2>
                      <Badge variant="amber">挂起中</Badge>
                    </div>
                    <div className="text-sm text-ink-500 mt-0.5">
                      <span className="flex items-center gap-1 flex-wrap">
                        休学/挂起的学生暂存于此，所有学情数据完整保留
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-amber-600">{suspendedStudents.length}</div>
                  <div className="text-xs text-ink-400">挂起学生</div>
                </div>
              </div>

              {/* 挂起学生列表 */}
              <div className="border border-ink-100 rounded-md overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mist border-b border-ink-100 text-xs font-medium text-ink-600">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">姓名</div>
                  <div className="col-span-2">学号</div>
                  <div className="col-span-2">原班级</div>
                  <div className="col-span-2">挂起时间</div>
                  <div className="col-span-2 text-right">操作</div>
                </div>
                {suspendedStudents.length === 0 ? (
                  <div className="text-center py-10 text-sm text-ink-400">
                    <PauseCircle className="w-8 h-8 mx-auto mb-2 text-ink-200" />
                    暂无挂起学生
                  </div>
                ) : (
                  suspendedStudents.map((s, idx) => {
                    const originalClass =
                      schoolClasses.find((c) => c.id === s.classId)?.name ||
                      personalClasses.find((c) => c.id === s.classId)?.name ||
                      "—";
                    return (
                      <div
                        key={s.id}
                        className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-ink-100 last:border-0 hover:bg-mist transition-colors text-sm items-center opacity-80"
                      >
                        <div className="col-span-1 text-ink-400 font-mono">{idx + 1}</div>
                        <div className="col-span-3 flex items-center gap-2">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                            s.isExternal
                              ? "bg-amber-50 text-amber-600"
                              : s.gender === "female"
                              ? "bg-pink-50 text-pink-600"
                              : "bg-teal-50 text-teal-600",
                          )}>
                            {s.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-ink-900 truncate flex items-center gap-1">
                              {s.name}
                              {s.isExternal && (
                                <Badge variant="amber" className="text-[10px] px-1 py-0">校外</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 text-ink-600 font-mono text-xs">{s.studentNo || "—"}</div>
                        <div className="col-span-2 text-ink-600 text-xs">
                          {originalClass !== "—" ? originalClass : "无班级"}
                        </div>
                        <div className="col-span-2 text-ink-500 text-xs">
                          {s.suspendedAt ? new Date(s.suspendedAt).toLocaleDateString("zh-CN") : "—"}
                        </div>
                        <div className="col-span-2 text-right">
                          <Button variant="outline" size="sm" onClick={() => openResume(s)}>
                            <PlayCircle className="w-3.5 h-3.5" />
                            恢复
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          ) : showDeparted ? (
            <DepartedStudentsArchive
              students={departedStudents}
              schoolClasses={schoolClasses}
              personalClasses={personalClasses}
            />
          ) : !selectedClass ? (
            <Card>
              <EmptyState
                icon={<Users className="w-7 h-7" />}
                title="请选择一个班级"
                description="从左侧选择班级查看学生列表与答题情况"
              />
            </Card>
          ) : (
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                    selectedClass.type === "personal" ? "bg-teal-50 text-teal-600" : "bg-gold-50 text-gold-600",
                  )}>
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-xl font-bold text-ink-900">{selectedClass.name}</h2>
                      <Badge variant={selectedClass.type === "personal" ? "teal" : "ink"}>
                        {selectedClass.type === "personal" ? "个人教学班" : "本校班级"}
                      </Badge>
                      {selectedClass.type === "school" && selectedClass.status === "graduated" && (
                        <Badge variant="amber">已毕业</Badge>
                      )}
                      {selectedClass.type === "school" && (() => {
            const ct = classTypes.find((c) => c.id === (selectedClass as SchoolClass).classTypeId);
            return ct ? (
              <span
                className="text-xs px-2 py-0.5 rounded border"
                style={{ backgroundColor: ct.color + "15", color: ct.color, borderColor: ct.color + "40" }}
              >
                {ct.name}
              </span>
            ) : null;
          })()}
                    </div>
                    {selectedClass.type === "school" ? (
                      <div className="text-sm text-ink-500 mt-0.5">
                        <span className="flex items-center gap-1 flex-wrap">
                          {selectedClass.grade}
                          {(selectedClass as SchoolClass).gradeYear && (
                            <>
                              <span className="text-ink-300">·</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {(selectedClass as SchoolClass).gradeYear}级 / {(selectedClass as SchoolClass).gradYear}届
                              </span>
                            </>
                          )}
                          <span className="text-ink-300">·</span>
                          {selectedClass.studentCount} 名学生
                          <span className="text-ink-300">·</span>
                          创建于 {formatDate(selectedClass.createdAt)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-ink-500 mt-0.5">
                        {selectedClass.description || "无描述"} · {selectedClass.studentIds.length} 名学生
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClass.type === "school" && (
                    <div className="relative">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClassActionMenuOpen((open) => !open)}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                        班级操作
                      </Button>
                      {classActionMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setClassActionMenuOpen(false)} />
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-ink-200 bg-white py-1 shadow-lg">
                            {selectedClass.status !== "graduated" && (
                              <>
                                <button
                                  onClick={() => {
                                    setClassActionMenuOpen(false);
                                    openEditClass(selectedClass);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ink-700 hover:bg-mist"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  编辑班级
                                </button>
                                <button
                                  onClick={handleGraduateClass}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50"
                                >
                                  <GraduationCap className="w-3.5 h-3.5" />
                                  整班毕业
                                </button>
                              </>
                            )}
                            {selectedClass.status === "graduated" && (
                              <div className="px-3 py-2 text-xs text-ink-400">班级已封存</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {!(selectedClass.type === "school" && selectedClass.status === "graduated") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        selectedClass.type === "personal" && !isPersonal
                          ? setAddToPersonalOpen(true)
                          : setAddStudentOpen(true)
                      }
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {selectedClass.type === "personal" ? "添加学生" : "新增学生"}
                    </Button>
                  )}
                </div>
              </div>

              {/* 学生列表 */}
              <div className="border border-ink-100 rounded-md">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mist border-b border-ink-100 text-xs font-medium text-ink-600 rounded-t-md">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">姓名</div>
                  <div className="col-span-3">学号</div>
                  <div className="col-span-2">年级</div>
                  <div className="col-span-2">状态</div>
                  <div className="col-span-1 text-right">操作</div>
                </div>
                {classStudents.length === 0 ? (
                  <div className="text-center py-10 text-sm text-ink-400 rounded-b-md">
                    <Users className="w-8 h-8 mx-auto mb-2 text-ink-200" />
                    {selectedClass.type === "school" && selectedClass.status === "graduated"
                      ? "班级已毕业，学生记录已归档"
                      : "暂无学生"}
                  </div>
                ) : (
                  <div className="relative">
                    {classStudents.map((s, idx) => {
                      const isSuspended = s.status === "suspended";
                      const isNearBottom = idx >= classStudents.length - 3;
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-ink-100 last:border-0 last:rounded-b-md hover:bg-mist transition-colors text-sm items-center",
                            isSuspended && "opacity-60",
                          )}
                        >
                          <div className="col-span-1 text-ink-400 font-mono">{idx + 1}</div>
                          <div className="col-span-3 flex items-center gap-2">
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                              s.isExternal
                                ? "bg-amber-50 text-amber-600"
                                : s.gender === "female"
                                ? "bg-pink-50 text-pink-600"
                                : "bg-teal-50 text-teal-600",
                            )}>
                              {s.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-ink-900 truncate flex items-center gap-1">
                                {s.name}
                                {s.isExternal && (
                                  <Badge variant="amber" className="text-[10px] px-1 py-0">校外</Badge>
                                )}
                              </div>
                              {s.isExternal && s.externalSchool && (
                                <div className="text-[10px] text-ink-400 truncate">{s.externalSchool}</div>
                              )}
                            </div>
                          </div>
                          <div className="col-span-3 text-ink-600 font-mono text-xs">{s.studentNo || "—"}</div>
                          <div className="col-span-2 text-ink-600">{s.grade || "—"}</div>
                          <div className="col-span-2">
                            {isSuspended ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                <PauseCircle className="w-3 h-3" />
                                挂起
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <PlayCircle className="w-3 h-3" />
                                在读
                              </span>
                            )}
                          </div>
                          <div className="col-span-1 text-right relative">
                            <button
                              onClick={() => setActionMenuStudentId(actionMenuStudentId === s.id ? null : s.id)}
                              className="p-1 text-ink-400 hover:text-ink-700"
                              title="更多操作"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {actionMenuStudentId === s.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setActionMenuStudentId(null)}
                                />
                                <div className={cn(
                                  "absolute right-0 z-50 bg-white border border-ink-200 rounded-md shadow-lg py-1 min-w-[160px] text-left",
                                  isNearBottom ? "bottom-full mb-1" : "top-full mt-1",
                                )}>
                                  <button
                                    onClick={() => openEditStudent(s)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ink-700 hover:bg-mist"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    编辑信息
                                  </button>
                                  {selectedClass?.type === "school" && (
                                    <button
                                      onClick={() => openTransfer(s)}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ink-700 hover:bg-mist"
                                    >
                                      <ArrowRightLeft className="w-3.5 h-3.5" />
                                      换班
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleSuspend(s)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-600 hover:bg-mist"
                                  >
                                    <PauseCircle className="w-3.5 h-3.5" />
                                    挂起（休学）
                                  </button>
                                  {selectedClass.type === "school" && (
                                    <>
                                      <button
                                        onClick={() => handleGraduateStudent(s)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gold-700 hover:bg-gold-50"
                                      >
                                        <GraduationCap className="w-3.5 h-3.5" />
                                        提前毕业
                                      </button>
                                      <button
                                        onClick={() => handleTransferOut(s)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                      >
                                        <School className="w-3.5 h-3.5" />
                                        转校
                                      </button>
                                    </>
                                  )}
                                  {selectedClass.type === "personal" && (
                                    <button
                                      onClick={async () => {
                                        await classService.removeStudentFromPersonalClass(selectedClass.id, s.id);
                                        toast.success("已移出班级");
                                        setActionMenuStudentId(null);
                                        await load();
                                        await loadClassStudents(selectedClass);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-mist"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      移出班级
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* 创建班级 */}
      <Modal
        open={createClassOpen}
        onClose={() => setCreateClassOpen(false)}
        size="sm"
        title={isPersonal || personalOnly ? "新建个人教学班" : tab === "school" ? "新建本校班级" : "新建个人教学班"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateClassOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleCreateClass}>
              <Plus className="w-3.5 h-3.5" />
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="班级名称"
            placeholder={isPersonal || tab === "personal" ? "如：张老师小班·冲刺组" : "如：高一(3)班"}
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            autoFocus
          />
          {!isPersonal && tab === "school" ? (
            <>
              <Select
                label="年级"
                value={newClassGrade}
                onChange={(e) => setNewClassGrade(e.target.value)}
                options={includeCurrentOption(gradeOptions, newClassGrade)}
              />
              <Select
                label="班型"
                value={newClassType}
                onChange={(e) => setNewClassType(e.target.value)}
                options={[
                  { value: "", label: "不设置" },
                  ...classTypes.map((ct) => ({ value: ct.id, label: ct.name })),
                ]}
              />
              <Input
                label="入学年份（级）"
                type="number"
                placeholder="如：2025"
                value={newClassGradeYear}
                onChange={(e) => setNewClassGradeYear(e.target.value)}
                hint={`毕业年份（届）将自动计算为 ${newClassGradeYear ? Number(newClassGradeYear) + 3 : "—"}`}
              />
            </>
          ) : (
            <Input
              label="描述"
              placeholder="教学班简介"
              value={newClassDesc}
              onChange={(e) => setNewClassDesc(e.target.value)}
            />
          )}
        </div>
      </Modal>

      {/* 编辑班级 */}
      <Modal
        open={editClassOpen}
        onClose={() => { setEditClassOpen(false); setEditingClass(null); }}
        size="sm"
        title="编辑班级信息"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setEditClassOpen(false); setEditingClass(null); }}>取消</Button>
            <Button variant="gold" onClick={handleEditClass}>
              保存修改
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="班级名称"
            placeholder="如：高一(3)班"
            value={editClassName}
            onChange={(e) => setEditClassName(e.target.value)}
            autoFocus
          />
          <Select
            label="年级"
            value={editClassGrade}
            onChange={(e) => setEditClassGrade(e.target.value)}
                options={includeCurrentOption(gradeOptions, editClassGrade)}
          />
          <Select
            label="班型"
            value={editClassType}
            onChange={(e) => setEditClassType(e.target.value)}
            options={[
              { value: "", label: "不设置" },
              ...classTypes.map((ct) => ({ value: ct.id, label: ct.name })),
            ]}
          />
          <Input
            label="入学年份（级）"
            type="number"
            placeholder="如：2025"
            value={editClassGradeYear}
            onChange={(e) => setEditClassGradeYear(e.target.value)}
            hint={`毕业年份（届）将自动计算为 ${editClassGradeYear ? Number(editClassGradeYear) + 3 : "—"}`}
          />
        </div>
      </Modal>

      {/* 添加学生 */}
      <Modal
        open={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        size="sm"
        title="新增学生"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddStudentOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleAddStudent}>
              <UserPlus className="w-3.5 h-3.5" />
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="姓名"
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            autoFocus
          />
          <Input
            label="学号"
            value={newStudentNo}
            onChange={(e) => setNewStudentNo(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="年级"
              value={newStudentGrade}
              onChange={(e) => setNewStudentGrade(e.target.value)}
                options={includeCurrentOption(gradeOptions, newStudentGrade)}
            />
            <Select
              label="性别"
              value={newStudentGender}
              onChange={(e) => setNewStudentGender(e.target.value as "male" | "female")}
              options={[
                { value: "male", label: "男" },
                { value: "female", label: "女" },
              ]}
            />
          </div>
        </div>
      </Modal>

      {/* 添加学生到个人班 */}
      <Modal
        open={addToPersonalOpen}
        onClose={() => setAddToPersonalOpen(false)}
        size="md"
        title="添加学生到教学班"
        description={selectedClass ? `目标：${selectedClass.name}` : undefined}
      >
        {/* Tab 切换 */}
        <div className="flex items-center gap-1 p-1 mb-4 rounded-md bg-ink-100">
          <button
            onClick={() => setAddStudentTab("school")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all",
              addStudentTab === "school" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-600",
            )}
          >
            本校学生
          </button>
          <button
            onClick={() => setAddStudentTab("external")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all",
              addStudentTab === "external" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-600",
            )}
          >
            校外学生
          </button>
        </div>

        {addStudentTab === "school" ? (
          <div className="space-y-3">
            <Input
              placeholder="搜索学生姓名或学号"
              value={searchStudentKw}
              onChange={(e) => setSearchStudentKw(e.target.value)}
            />
            <div className="max-h-96 overflow-y-auto space-y-1.5">
              {filteredStudents.filter(s => !s.isExternal).map((s) => {
                const inClass = classStudentIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-2.5 rounded-md border border-ink-100 hover:bg-mist"
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                      s.gender === "female" ? "bg-pink-50 text-pink-600" : "bg-teal-50 text-teal-600",
                    )}>
                      {s.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900">{s.name}</div>
                      <div className="text-xs text-ink-500">
                        {s.studentNo} · {s.grade}
                      </div>
                    </div>
                    <Button
                      variant={inClass ? "ghost" : "outline"}
                      size="sm"
                      disabled={inClass}
                      onClick={() => handleAddToPersonal(s.id)}
                    >
                      {inClass ? "已添加" : "添加"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-ink-500 mb-2">
              添加校外学生，填写学生基本信息
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="姓名"
                value={extStudentName}
                onChange={(e) => setExtStudentName(e.target.value)}
                placeholder="学生姓名"
              />
              <Input
                label="学号"
                value={extStudentNo}
                onChange={(e) => setExtStudentNo(e.target.value)}
                placeholder="学号/编号"
              />
            </div>
            <Input
              label="学校名称"
              value={extStudentSchool}
              onChange={(e) => setExtStudentSchool(e.target.value)}
              placeholder="请输入所在学校名称"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="年级"
                value={extStudentGrade}
                onChange={(e) => setExtStudentGrade(e.target.value)}
                options={includeCurrentOption(gradeOptions, extStudentGrade)}
              />
              <Select
                label="性别"
                value={extStudentGender}
                onChange={(e) => setExtStudentGender(e.target.value as "male" | "female")}
                options={[
                  { value: "male", label: "男" },
                  { value: "female", label: "女" },
                ]}
              />
            </div>
            <Button variant="gold" onClick={handleAddExternalStudent} className="w-full">
              <UserPlus className="w-4 h-4" />
              添加校外学生
            </Button>
          </div>
        )}
      </Modal>

      {/* 编辑学生（含学号） */}
      <Modal
        open={editStudentOpen}
        onClose={() => { setEditStudentOpen(false); setEditingStudent(null); }}
        size="sm"
        title="编辑学生信息"
        description="学号是扫描答题卡识别学生的关键字段，请确保唯一且正确"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setEditStudentOpen(false); setEditingStudent(null); }}>取消</Button>
            <Button variant="gold" onClick={handleEditStudent}>保存修改</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="姓名"
            value={editStudentName}
            onChange={(e) => setEditStudentName(e.target.value)}
            placeholder="请输入学生姓名"
          />
          <Input
            label="学号"
            value={editStudentNo}
            onChange={(e) => setEditStudentNo(e.target.value)}
            placeholder="学号（用于答题卡扫描识别）"
          />
          <Select
            label="年级"
            value={editStudentGrade}
            onChange={(e) => setEditStudentGrade(e.target.value)}
                options={includeCurrentOption(gradeOptions, editStudentGrade)}
          />
          <Select
            label="性别"
            value={editStudentGender}
            onChange={(e) => setEditStudentGender(e.target.value as "male" | "female")}
            options={[
              { value: "male", label: "男" },
              { value: "female", label: "女" },
            ]}
          />
          {editingStudent?.isExternal && (
            <Input
              label="校外学校"
              value={editStudentSchool}
              onChange={(e) => setEditStudentSchool(e.target.value)}
              placeholder="学生所在学校名称"
            />
          )}
        </div>
      </Modal>

      {/* 恢复学生 */}
      <Modal
        open={resumeOpen}
        onClose={() => { setResumeOpen(false); setResumingStudent(null); setResumeTargetClass(""); }}
        size="sm"
        title="恢复学生"
        description={resumingStudent ? `将「${resumingStudent.name}」从挂起状态恢复` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setResumeOpen(false); setResumingStudent(null); setResumeTargetClass(""); }}>取消</Button>
            <Button variant="gold" onClick={handleResume}>
              <PlayCircle className="w-3.5 h-3.5" />
              确认恢复
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-800">
            恢复后学生将进入所选班级，所有历史学情数据（答题记录、知识点掌握等）将完整保留。
          </div>
          <Select
            label="恢复到班级"
            value={resumeTargetClass}
            onChange={(e) => setResumeTargetClass(e.target.value)}
            options={[
              { value: "", label: "请选择班级" },
              ...(tab === "school"
                ? schoolClasses
                    .filter((c) => c.status !== "graduated")
                    .map((c) => ({ value: c.id, label: `${c.grade} · ${c.name}` }))
                : personalClasses.map((c) => ({ value: c.id, label: c.name }))
              ),
            ]}
          />
        </div>
      </Modal>

      {/* 换班 */}
      <Modal
        open={transferOpen}
        onClose={() => { setTransferOpen(false); setTransferringStudent(null); }}
        size="sm"
        title="学生换班"
        description={transferringStudent ? `将「${transferringStudent.name}」转入新班级` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setTransferOpen(false); setTransferringStudent(null); }}>取消</Button>
            <Button variant="gold" onClick={handleTransfer}>
              <ArrowRightLeft className="w-3.5 h-3.5" />
              确认换班
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-gold-50 border border-gold-200 rounded-md p-3 text-xs text-gold-800">
            换班后学生的所有学情数据（答题记录、知识点掌握等）将完整保留，不会丢失。
          </div>
          <Select
            label="目标班级"
            value={transferTargetClass}
            onChange={(e) => setTransferTargetClass(e.target.value)}
            options={[
              { value: "", label: "请选择班级" },
              ...schoolClasses
                .filter((c) => c.id !== transferringStudent?.classId && c.status !== "graduated")
                .map((c) => ({ value: c.id, label: `${c.grade} · ${c.name}` })),
            ]}
          />
          <Input
            label="新学号（可选）"
            value={transferNewStudentNo}
            onChange={(e) => setTransferNewStudentNo(e.target.value)}
            placeholder={transferringStudent ? `当前学号：${transferringStudent.studentNo}` : "如需调整学号请填写"}
            hint="不填则保留原学号"
          />
        </div>
      </Modal>
    </div>
  );
}

function DepartedStudentsArchive({
  students,
  schoolClasses,
  personalClasses,
}: {
  students: Student[];
  schoolClasses: SchoolClass[];
  personalClasses: PersonalClass[];
}) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-ink-100 text-ink-600">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-bold text-ink-900">离校学生档案</h2>
              <Badge variant="ink">只读档案</Badge>
            </div>
            <div className="text-sm text-ink-500 mt-0.5">
              已毕业或已转校学生保留在此，历史学情数据不会删除
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-ink-700">{students.length}</div>
          <div className="text-xs text-ink-400">离校学生</div>
        </div>
      </div>

      <div className="border border-ink-100 rounded-md overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mist border-b border-ink-100 text-xs font-medium text-ink-600">
          <div className="col-span-1">#</div>
          <div className="col-span-3">姓名</div>
          <div className="col-span-2">学号</div>
          <div className="col-span-2">原班级</div>
          <div className="col-span-2">离校原因</div>
          <div className="col-span-2">离校时间</div>
        </div>
        {students.map((student, index) => {
          const originalClass = schoolClasses.find((item) => item.id === student.classId)?.name
            || personalClasses.find((item) => item.id === student.classId)?.name
            || "无班级";
          const departedAt = student.status === "graduated" ? student.graduatedAt : student.transferredAt;
          const statusLabel = student.status === "graduated"
            ? student.graduationType === "early" ? "提前毕业" : "正常毕业"
            : "转校";
          return (
            <div
              key={student.id}
              className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-ink-100 last:border-0 text-sm items-center hover:bg-mist"
            >
              <div className="col-span-1 text-ink-400 font-mono">{index + 1}</div>
              <div className="col-span-3 flex items-center gap-2 min-w-0">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                  student.gender === "female" ? "bg-pink-50 text-pink-600" : "bg-teal-50 text-teal-600",
                )}>
                  {student.name.charAt(0)}
                </div>
                <span className="truncate text-ink-900">{student.name}</span>
              </div>
              <div className="col-span-2 text-ink-600 font-mono text-xs">{student.studentNo || "—"}</div>
              <div className="col-span-2 text-ink-600 text-xs truncate">{originalClass}</div>
              <div className="col-span-2">
                <span className={cn(
                  "inline-flex text-xs px-2 py-0.5 rounded-full border",
                  student.status === "graduated"
                    ? "bg-gold-50 text-gold-700 border-gold-200"
                    : "bg-red-50 text-red-700 border-red-200",
                )}>
                  {statusLabel}
                </span>
              </div>
              <div className="col-span-2 text-ink-500 text-xs">
                {departedAt ? new Date(departedAt).toLocaleDateString("zh-CN") : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ClassListItem({
  cls,
  selected,
  onSelect,
  onDelete,
  classTypeName,
  classTypeColor,
}: {
  cls: AnyClass;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  classTypeName?: string;
  classTypeColor?: string;
}) {
  const count = cls.type === "school" ? cls.studentCount : cls.studentIds.length;
  const isGraduated = cls.type === "school" && cls.status === "graduated";
  return (
    <div
      className={cn(
        "group flex items-center gap-2 p-3 rounded-md border transition-all cursor-pointer",
        selected ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
        isGraduated && "opacity-70",
      )}
      onClick={onSelect}
    >
      <div className={cn(
        "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0",
        cls.type === "personal" ? "bg-teal-50 text-teal-600" : "bg-gold-50 text-gold-600",
      )}>
        <GraduationCap className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-ink-900 truncate">{cls.name}</span>
          {isGraduated && (
            <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
              已毕业
            </span>
          )}
          {classTypeName && (
            <span
              className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border"
              style={{
                backgroundColor: classTypeColor + "15",
                color: classTypeColor,
                borderColor: classTypeColor + "40",
              }}
            >
              {classTypeName}
            </span>
          )}
        </div>
        <div className="text-xs text-ink-500">{count} 名学生</div>
      </div>
      <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-gold-600 flex-shrink-0" />
      {cls.type === "personal" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 text-ink-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

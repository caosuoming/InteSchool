import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArchiveRestore,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
  downloadStudentRosterTemplate,
  readStudentRosterFile,
} from "@/lib/student-roster-spreadsheet";
import { cn } from "@/lib/utils";
import { classService } from "@/services/class";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type {
  SchoolClass,
  SchoolGrade,
  SchoolRosterRecycleBin,
  Student,
} from "@/types";

const EMPTY_RECYCLE_BIN: SchoolRosterRecycleBin = { classes: [], students: [] };

function classBelongsToGrade(item: SchoolClass, grade: SchoolGrade): boolean {
  if (item.gradeId) return item.gradeId === grade.id;
  return item.gradYear === grade.gradYear && item.grade === grade.grade;
}

function gradeStatusLabel(grade: SchoolGrade): string {
  return grade.status === "graduated" ? "已毕业" : grade.grade;
}

export default function SchoolRosterPage() {
  const navigate = useNavigate();
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  const schoolId = affiliation?.schoolId || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [grades, setGrades] = useState<SchoolGrade[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [recycleBin, setRecycleBin] = useState<SchoolRosterRecycleBin>(EMPTY_RECYCLE_BIN);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [gradeYear, setGradeYear] = useState(String(new Date().getFullYear() + 3));
  const [gradeLevel, setGradeLevel] = useState("高一");
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [classNames, setClassNames] = useState("");
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentNo, setEditStudentNo] = useState("");
  const [editStudentSubjectSelection, setEditStudentSubjectSelection] = useState("");
  const [editStudentGrade, setEditStudentGrade] = useState("");
  const [editStudentGender, setEditStudentGender] = useState<"male" | "female">("male");

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [nextGrades, nextClasses, nextStudents, nextRecycleBin] = await Promise.all([
        classService.listSchoolGrades(schoolId),
        classService.listSchoolClasses(schoolId),
        classService.listStudentsBySchool(schoolId),
        classService.listSchoolRosterRecycleBin(schoolId),
      ]);
      setGrades(nextGrades);
      setClasses(nextClasses);
      setStudents(nextStudents);
      setRecycleBin(nextRecycleBin);
      setSelectedGradeId((current) =>
        nextGrades.some((item) => item.id === current) ? current : nextGrades[0]?.id || "",
      );
    } catch (error) {
      toast.error("班级与学生数据加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedGrade = grades.find((item) => item.id === selectedGradeId) || null;
  const gradeClasses = useMemo(
    () => selectedGrade
      ? classes.filter((item) => classBelongsToGrade(item, selectedGrade))
      : [],
    [classes, selectedGrade],
  );

  useEffect(() => {
    setSelectedClassId((current) =>
      gradeClasses.some((item) => item.id === current) ? current : gradeClasses[0]?.id || "",
    );
  }, [gradeClasses]);

  const selectedClass = gradeClasses.find((item) => item.id === selectedClassId) || null;
  const classStudents = useMemo(
    () => students.filter((item) => item.classId === selectedClassId && item.status === "active"),
    [selectedClassId, students],
  );

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    try {
      await action();
    } catch (error) {
      toast.error("操作失败", error instanceof Error ? error.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  const handleCreateGrade = () => run(async () => {
    if (!teacher) return;
    const numericYear = Number(gradeYear);
    const created = await classService.createSchoolGrade(schoolId, teacher.id, numericYear, gradeLevel);
    toast.success(`已创建 ${created.name}`);
    setGradeModalOpen(false);
    setSelectedGradeId(created.id);
    await load();
  });

  const handleCreateClasses = () => run(async () => {
    if (!teacher || !selectedGrade) return;
    const names = classNames.split(/\r?\n|、|,/).map((item) => item.trim()).filter(Boolean);
    const created = await classService.bulkCreateSchoolClasses(selectedGrade.id, teacher.id, names);
    toast.success(`已新增 ${created.length} 个班级`);
    setClassNames("");
    setClassModalOpen(false);
    await load();
  });

  const handleAdvanceGrade = () => run(async () => {
    if (!selectedGrade) return;
    if (!window.confirm(`确定将“${selectedGrade.name}”统一升学年吗？班级和在册学生的年级会同步更新。`)) return;
    const result = await classService.advanceSchoolGrade(selectedGrade.id);
    toast.success(`已升为 ${result.grade.name}`, `更新 ${result.updatedClasses} 个班级、${result.updatedStudents} 名学生`);
    await load();
  });

  const handleImportFile = async (file: File | undefined) => {
    if (!file || !teacher || !selectedGrade) return;
    await run(async () => {
      const rows = await readStudentRosterFile(file);
      const result = await classService.bulkImportStudents(selectedGrade.id, teacher.id, rows);
      toast.success(
        `已导入 ${result.createdStudents} 名学生`,
        `${result.createdClasses} 个班级自动创建，${result.skippedStudents} 条重复学号已跳过`,
      );
      await load();
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteClass = (item: SchoolClass) => run(async () => {
    if (!window.confirm(`确定删除“${item.name}”吗？班级和所属学生会进入回收站。`)) return;
    await classService.deleteClass(item.id, false);
    toast.success("班级已移入回收站");
    await load();
  });

  const handleDeleteStudent = (item: Student) => run(async () => {
    if (!window.confirm(`确定删除学生“${item.name}”吗？该学生会进入回收站。`)) return;
    await classService.deleteStudent(item.id);
    toast.success("学生已移入回收站");
    await load();
  });

  const openEditStudent = (item: Student) => {
    setEditingStudent(item);
    setEditStudentName(item.name);
    setEditStudentNo(item.studentNo || "");
    setEditStudentSubjectSelection(item.subjectSelection || "");
    setEditStudentGrade(item.grade || selectedGrade?.grade || "");
    setEditStudentGender(item.gender || "male");
    setEditStudentOpen(true);
  };

  const handleEditStudent = () => run(async () => {
    if (!editingStudent) return;
    const name = editStudentName.trim();
    const studentNo = editStudentNo.trim();
    if (!name) {
      toast.error("请填写学生姓名");
      return;
    }
    if (studentNo) {
      const duplicate = students.find((item) =>
        item.id !== editingStudent.id
        && item.status !== "deleted"
        && item.studentNo === studentNo,
      );
      if (duplicate) {
        toast.error("学号已存在", `与“${duplicate.name}”的学号重复`);
        return;
      }
    }
    await classService.updateStudent(editingStudent.id, {
      name,
      studentNo,
      subjectSelection: editStudentSubjectSelection.trim() || undefined,
      grade: editStudentGrade,
      gender: editStudentGender,
    });
    toast.success(`已更新学生“${name}”`);
    setEditStudentOpen(false);
    setEditingStudent(null);
    await load();
  });

  const handleRestoreClass = (item: SchoolClass) => run(async () => {
    const result = await classService.restoreSchoolClass(item.id);
    toast.success(`已恢复班级“${result.class.name}”`, `同时恢复 ${result.restoredStudents} 名学生`);
    await load();
  });

  const handleRestoreStudent = (item: Student) => run(async () => {
    await classService.restoreStudent(item.id);
    toast.success(`已恢复学生“${item.name}”`);
    await load();
  });

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Spinner size={28} /></div>;
  }

  return (
    <div>
      <PageHeader
        title="班级与学生"
        description="先建立年级，再维护班级和学生；支持 Excel 批量导入、统一升学年与回收站恢复。"
        icon={<GraduationCap className="h-5 w-5" />}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/classes")}>
              <Layers className="h-4 w-4" />
              个人教学班
            </Button>
            <Button variant={showRecycleBin ? "ink" : "outline"} onClick={() => setShowRecycleBin((value) => !value)}>
              <ArchiveRestore className="h-4 w-4" />
              回收站 ({recycleBin.classes.length + recycleBin.students.length})
            </Button>
            <Button variant="gold" onClick={() => setGradeModalOpen(true)}>
              <Plus className="h-4 w-4" />
              新建年级
            </Button>
          </div>
        }
      />

      {showRecycleBin ? (
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold text-ink-900">班级与学生回收站</h2>
              <p className="mt-1 text-xs text-ink-500">恢复班级时会一并恢复随班级删除的学生；单独删除的学生可独立恢复。</p>
            </div>
            <Button variant="ghost" onClick={() => setShowRecycleBin(false)}>返回管理</Button>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <RecycleSection title="已删除班级" empty="暂无已删除班级">
              {recycleBin.classes.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-ink-100 px-3 py-3 last:border-0">
                  <div>
                    <div className="font-medium text-ink-900">{item.name}</div>
                    <div className="mt-0.5 text-xs text-ink-400">{item.grade} · {item.gradYear ? `${item.gradYear}届` : "未设置届别"}</div>
                  </div>
                  <Button size="sm" variant="outline" loading={working} onClick={() => handleRestoreClass(item)}>
                    <RotateCcw className="h-3.5 w-3.5" />恢复
                  </Button>
                </div>
              ))}
            </RecycleSection>
            <RecycleSection title="已删除学生" empty="暂无已删除学生">
              {recycleBin.students.map((item) => {
                const classItem = [...classes, ...recycleBin.classes].find((candidate) => candidate.id === item.classId);
                return (
                  <div key={item.id} className="flex items-center justify-between border-b border-ink-100 px-3 py-3 last:border-0">
                    <div>
                      <div className="font-medium text-ink-900">{item.name} <span className="ml-2 font-mono text-xs text-ink-400">{item.studentNo}</span></div>
                      <div className="mt-0.5 text-xs text-ink-400">{classItem?.name || "原班级已删除"}</div>
                    </div>
                    <Button size="sm" variant="outline" loading={working} onClick={() => handleRestoreStudent(item)}>
                      <RotateCcw className="h-3.5 w-3.5" />恢复
                    </Button>
                  </div>
                );
              })}
            </RecycleSection>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-ink-900">年级</div>
                <Badge>{grades.length} 个</Badge>
              </div>
              {selectedGrade && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setClassModalOpen(true)} disabled={selectedGrade.status === "graduated"}>
                    <Plus className="h-3.5 w-3.5" />批量班级
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleAdvanceGrade} disabled={selectedGrade.grade === "高三" || selectedGrade.status === "graduated"} loading={working}>
                    <GraduationCap className="h-3.5 w-3.5" />升学年
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadStudentRosterTemplate(selectedGrade.name)}>
                    <Download className="h-3.5 w-3.5" />下载模板
                  </Button>
                  <Button size="sm" variant="gold" onClick={() => fileInputRef.current?.click()} disabled={selectedGrade.status === "graduated"} loading={working}>
                    <Upload className="h-3.5 w-3.5" />导入学生
                  </Button>
                  <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    accept=".xlsx,.xlsm"
                    onChange={(event) => void handleImportFile(event.target.files?.[0])}
                  />
                </div>
              )}
            </div>

            {grades.length === 0 ? (
              <EmptyState icon={<GraduationCap className="h-7 w-7" />} title="尚未创建年级" description="先创建如“2027届高二”的年级。" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {grades.map((item) => {
                  const count = classes.filter((classItem) => classBelongsToGrade(classItem, item)).length;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedGradeId(item.id)}
                      title={`${item.name} · ${count} 个班级 · ${gradeStatusLabel(item)}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        selectedGradeId === item.id
                          ? "border-gold-400 bg-gold-50 text-ink-900"
                          : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-mist",
                      )}
                    >
                      <GraduationCap className="h-3.5 w-3.5 text-gold-600" />
                      {item.name}
                      <span className="text-[10px] text-ink-400">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedGrade && (
              <div className="mt-4 border-t border-ink-100 pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{selectedGrade.name}</div>
                    <div className="mt-0.5 text-xs text-ink-400">选择班级后在下方查看和编辑学生资料</div>
                  </div>
                  <Badge>{gradeClasses.length} 个班级</Badge>
                </div>
                {gradeClasses.length === 0 ? (
                  <EmptyState icon={<Users className="h-7 w-7" />} title="该年级暂无班级" description="可批量填写班级名称，或在导入学生时自动创建。" />
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-10">
                    {gradeClasses.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "group relative min-w-0 rounded-md border transition-colors",
                          selectedClassId === item.id
                            ? "border-gold-400 bg-gold-50"
                            : "border-ink-200 bg-white hover:border-ink-300 hover:bg-mist",
                        )}
                      >
                        <button
                          className="w-full min-w-0 px-2 py-1.5 pr-6 text-left"
                          onClick={() => setSelectedClassId(item.id)}
                          aria-label={`选择班级 ${item.name}`}
                          title={`${item.name} · ${item.studentCount} 名在读学生`}
                        >
                          <div className="truncate text-xs font-medium text-ink-900">{item.name}</div>
                          <div className="truncate text-[10px] text-ink-400">{item.studentCount} 人</div>
                        </button>
                        <button
                          className="absolute right-1 top-1 p-1 text-ink-300 transition-opacity hover:text-red-600 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                          aria-label={`删除班级 ${item.name}`}
                          title={`删除班级 ${item.name}`}
                          onClick={() => handleDeleteClass(item)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-lg font-semibold text-ink-900">{selectedClass?.name || "学生名单"}</h2>
                <p className="mt-1 text-xs text-ink-500">选中班级后可直接编辑姓名、学号、选科、年级和性别；Excel 仍支持批量导入。</p>
              </div>
              <Badge variant="teal">{classStudents.length} 人</Badge>
            </div>
            {!selectedClass ? (
              <EmptyState icon={<FileSpreadsheet className="h-7 w-7" />} title="请选择班级" description="从上方选择年级和班级查看学生。" />
            ) : classStudents.length === 0 ? (
              <EmptyState icon={<Users className="h-7 w-7" />} title="暂无学生" description="下载模板并上传 Excel，可一次导入多个班级的学生。" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-ink-100">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="bg-mist text-xs text-ink-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">姓名</th>
                      <th className="px-4 py-2.5 text-left font-medium">学号</th>
                      <th className="px-4 py-2.5 text-left font-medium">选科</th>
                      <th className="px-4 py-2.5 text-left font-medium">年级</th>
                      <th className="px-4 py-2.5 text-left font-medium">类型</th>
                      <th className="px-4 py-2.5 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {classStudents.map((item) => (
                      <tr key={item.id} className="hover:bg-mist/60">
                        <td className="px-4 py-3 font-medium text-ink-900">{item.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-600">{item.studentNo || "—"}</td>
                        <td className="px-4 py-3 text-ink-600">{item.subjectSelection || "—"}</td>
                        <td className="px-4 py-3 text-ink-600">{item.grade}</td>
                        <td className="px-4 py-3">{item.isExternal ? <Badge variant="amber">借读生</Badge> : <Badge>本校生</Badge>}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditStudent(item)}>
                              <Pencil className="h-3.5 w-3.5" />编辑
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteStudent(item)} loading={working}>
                              <Trash2 className="h-3.5 w-3.5" />删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={gradeModalOpen}
        onClose={() => setGradeModalOpen(false)}
        title="新建年级"
        description="例如：毕业年份 2027、当前年级高二，会创建“2027届高二”。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGradeModalOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleCreateGrade} loading={working}>创建年级</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="毕业年份（届）" type="number" min={2000} max={2200} value={gradeYear} onChange={(event) => setGradeYear(event.target.value)} />
          <Select label="当前年级" value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)} options={[
            { value: "高一", label: "高一" },
            { value: "高二", label: "高二" },
            { value: "高三", label: "高三" },
          ]} />
        </div>
      </Modal>

      <Modal
        open={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        title={`批量新增班级${selectedGrade ? ` · ${selectedGrade.name}` : ""}`}
        description="每行填写一个班级名称，也可使用逗号或顿号分隔。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setClassModalOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleCreateClasses} loading={working}>批量创建</Button>
          </>
        }
      >
        <Textarea
          label="班级名称"
          rows={8}
          placeholder={'高二（1）班\n高二（2）班\n高二（3）班'}
          value={classNames}
          onChange={(event) => setClassNames(event.target.value)}
        />
      </Modal>

      <Modal
        open={editStudentOpen}
        onClose={() => {
          setEditStudentOpen(false);
          setEditingStudent(null);
        }}
        title="编辑学生资料"
        description={selectedClass ? `所属班级：${selectedClass.name}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => {
              setEditStudentOpen(false);
              setEditingStudent(null);
            }}>取消</Button>
            <Button variant="gold" onClick={handleEditStudent} loading={working}>保存修改</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="姓名" value={editStudentName} onChange={(event) => setEditStudentName(event.target.value)} autoFocus />
          <Input label="学号" value={editStudentNo} onChange={(event) => setEditStudentNo(event.target.value)} />
          <Input
            label="选科"
            placeholder="如：物化生、史政地"
            value={editStudentSubjectSelection}
            onChange={(event) => setEditStudentSubjectSelection(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="年级" value={editStudentGrade} onChange={(event) => setEditStudentGrade(event.target.value)} />
            <Select
              label="性别"
              value={editStudentGender}
              onChange={(event) => setEditStudentGender(event.target.value as "male" | "female")}
              options={[
                { value: "male", label: "男" },
                { value: "female", label: "女" },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RecycleSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-hidden rounded-lg border border-ink-100">
      <div className="flex items-center justify-between border-b border-ink-100 bg-mist px-4 py-3">
        <div className="text-sm font-medium text-ink-900">{title}</div>
        <Badge>{count}</Badge>
      </div>
      {count > 0 ? children : <div className="px-4 py-10 text-center text-sm text-ink-400">{empty}</div>}
    </div>
  );
}

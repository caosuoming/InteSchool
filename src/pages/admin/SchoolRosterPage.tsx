import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArchiveRestore,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  PauseCircle,
  Pencil,
  Plus,
  RotateCcw,
  School,
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
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type {
  ClassTypeCategory,
  SchoolClass,
  SchoolGrade,
  SchoolRosterRecycleBin,
  Student,
  StudentRosterImportRow,
  Teacher,
} from "@/types";

const EMPTY_RECYCLE_BIN: SchoolRosterRecycleBin = { classes: [], students: [] };
type RosterView = "manage" | "deleted" | "suspended" | "transferred";

function classBelongsToGrade(item: SchoolClass, grade: SchoolGrade): boolean {
  if (item.gradeId) return item.gradeId === grade.id;
  return item.gradYear === grade.gradYear && item.grade === grade.grade;
}

function gradeStatusLabel(grade: SchoolGrade): string {
  return grade.status === "graduated" ? "已毕业" : grade.grade;
}

function teacherAffiliation(teacher: Teacher, schoolId: string) {
  return teacher.affiliations?.find((item) => item.schoolId === schoolId);
}

function assignedClassIds(teacher: Teacher, schoolId: string, kind: "teaching" | "homeroom"): string[] {
  const affiliation = teacherAffiliation(teacher, schoolId);
  return kind === "teaching"
    ? affiliation?.teachingClassIds || teacher.teachingClassIds || []
    : affiliation?.homeroomClassIds || teacher.homeroomClassIds || [];
}

function teacherSubject(teacher: Teacher, schoolId: string): string {
  return teacherAffiliation(teacher, schoolId)?.subject || teacher.subject || "未设置学科";
}

function toggleAssignment(values: string[], classId: string, assigned: boolean): string[] {
  return assigned
    ? [...new Set([...values, classId])]
    : values.filter((value) => value !== classId);
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function classTypeStyle(color: string | undefined, selected: boolean): CSSProperties | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return {
    backgroundColor: `${color}${selected ? "2e" : "18"}`,
    borderColor: `${color}${selected ? "cc" : "66"}`,
  };
}

function majorityValue(values: string[]): string | null {
  if (values.length < 2) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  if (counts.size < 2) return null;
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return ranked[0][1] > ranked[1][1] ? ranked[0][0] : null;
}

function normalizeRosterName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

interface RosterReviewRow {
  rowIndex: number;
  row: StudentRosterImportRow;
  reason: "sameName" | "unmatched";
}

interface RosterImportReview {
  reviewRows: RosterReviewRow[];
  autoMatchedStudentIds: string[];
  gradeStudents: Student[];
}

interface PendingRosterImport {
  rows: StudentRosterImportRow[];
  review: RosterImportReview;
  resolutions: Record<string, string>;
}

function unresolvedOldStudents(pending: PendingRosterImport): Student[] {
  const matched = new Set(pending.review.autoMatchedStudentIds);
  for (const value of Object.values(pending.resolutions)) {
    if (value && value !== "__create__") matched.add(value);
  }
  return pending.review.gradeStudents.filter((student) => !matched.has(student.id));
}

function buildRosterImportReview(
  rows: StudentRosterImportRow[],
  students: Student[],
  classes: SchoolClass[],
  grade: SchoolGrade,
): RosterImportReview {
  const gradeClassIds = new Set(
    classes.filter((item) => classBelongsToGrade(item, grade)).map((item) => item.id),
  );
  const classByName = new Map(
    classes
      .filter((item) => classBelongsToGrade(item, grade))
      .map((item) => [normalizeRosterName(item.name), item] as const),
  );
  const gradeStudents = students.filter((student) =>
    student.status === "active" && gradeClassIds.has(student.classId),
  );
  const byName = new Map<string, Student[]>();
  for (const student of gradeStudents) {
    const key = normalizeRosterName(student.name);
    byName.set(key, [...(byName.get(key) || []), student]);
  }

  const seenStudentNumbers = new Set<string>();
  const matchedIds = new Set<string>();
  const reviewRows: RosterReviewRow[] = [];
  rows.forEach((row, rowIndex) => {
    const studentNo = row.studentNo?.trim().toLocaleLowerCase("zh-CN") || "";
    if (studentNo && seenStudentNumbers.has(studentNo)) return;
    if (studentNo) seenStudentNumbers.add(studentNo);

    if (studentNo) {
      const byNumber = gradeStudents.filter((student) =>
        !matchedIds.has(student.id)
        && student.studentNo?.trim().toLocaleLowerCase("zh-CN") === studentNo,
      );
      if (byNumber.length === 1) {
        matchedIds.add(byNumber[0].id);
        return;
      }
    }

    const candidates = (byName.get(normalizeRosterName(row.name)) || [])
      .filter((student) => !matchedIds.has(student.id));
    const targetClass = classByName.get(normalizeRosterName(row.className));
    const sameClass = targetClass
      ? candidates.filter((student) => student.classId === targetClass.id)
      : [];
    if (candidates.length === 1 && sameClass.length === 1) {
      matchedIds.add(candidates[0].id);
      return;
    }
    if (candidates.length > 0) {
      reviewRows.push({ rowIndex, row, reason: "sameName" });
      return;
    }
    if (gradeStudents.some((student) => !matchedIds.has(student.id))) {
      reviewRows.push({ rowIndex, row, reason: "unmatched" });
    }
  });

  return {
    reviewRows,
    autoMatchedStudentIds: [...matchedIds],
    gradeStudents,
  };
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
  const [classTypes, setClassTypes] = useState<ClassTypeCategory[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [recycleBin, setRecycleBin] = useState<SchoolRosterRecycleBin>(EMPTY_RECYCLE_BIN);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [rosterView, setRosterView] = useState<RosterView>("manage");
  const [pendingRosterImport, setPendingRosterImport] = useState<PendingRosterImport | null>(null);

  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [gradeYear, setGradeYear] = useState(String(new Date().getFullYear() + 3));
  const [gradeLevel, setGradeLevel] = useState("高一");
  const [editGradeOpen, setEditGradeOpen] = useState(false);
  const [editGradeName, setEditGradeName] = useState("");
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [classNames, setClassNames] = useState("");
  const [editClassOpen, setEditClassOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [editClassName, setEditClassName] = useState("");
  const [editClassTypeId, setEditClassTypeId] = useState("");
  const [editHomeroomTeacherId, setEditHomeroomTeacherId] = useState("");
  const [editSubjectTeacherIds, setEditSubjectTeacherIds] = useState<string[]>([]);
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentNo, setEditStudentNo] = useState("");
  const [editStudentSubjectSelection, setEditStudentSubjectSelection] = useState("");
  const [editStudentGrade, setEditStudentGrade] = useState("");
  const [editStudentGender, setEditStudentGender] = useState<"male" | "female">("male");
  const [editStudentTransferClassId, setEditStudentTransferClassId] = useState("");

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [nextGrades, nextClasses, nextStudents, nextRecycleBin, nextClassTypes, nextTeachers] = await Promise.all([
        classService.listSchoolGrades(schoolId),
        classService.listSchoolClasses(schoolId),
        classService.listStudentsBySchool(schoolId),
        classService.listSchoolRosterRecycleBin(schoolId),
        settingsService.listClassTypes(schoolId),
        authService.listTeachers(),
      ]);
      setGrades(nextGrades);
      setClasses(nextClasses);
      setStudents(nextStudents);
      setRecycleBin(nextRecycleBin);
      setClassTypes(nextClassTypes);
      setTeachers(nextTeachers);
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
  const suspendedStudents = useMemo(
    () => students.filter((item) => item.status === "suspended"),
    [students],
  );
  const transferredStudents = useMemo(
    () => students.filter((item) => item.status === "transferred"),
    [students],
  );
  const classTypeById = useMemo(
    () => new Map(classTypes.map((item) => [item.id, item])),
    [classTypes],
  );
  const classTeacherDetails = useMemo(() => {
    const result = new Map<string, { homeroom: Teacher | null; subjectTeachers: Teacher[] }>();
    for (const item of classes) {
      result.set(item.id, {
        homeroom: teachers.find((entry) => assignedClassIds(entry, schoolId, "homeroom").includes(item.id)) || null,
        subjectTeachers: teachers.filter((entry) => assignedClassIds(entry, schoolId, "teaching").includes(item.id)),
      });
    }
    return result;
  }, [classes, schoolId, teachers]);
  const commonSubjectSelection = useMemo(
    () => majorityValue(classStudents.map((item) => item.subjectSelection?.trim() || "__empty__")),
    [classStudents],
  );
  const commonStudentType = useMemo(
    () => majorityValue(classStudents.map((item) => item.isExternal ? "external" : "internal")),
    [classStudents],
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

  const openEditGrade = () => {
    if (!selectedGrade) return;
    setEditGradeName(selectedGrade.name);
    setEditGradeOpen(true);
  };

  const handleEditGrade = () => run(async () => {
    if (!selectedGrade) return;
    const name = editGradeName.trim();
    if (!name) {
      toast.error("请填写年级名称");
      return;
    }
    await classService.updateSchoolGrade(selectedGrade.id, { name });
    toast.success(`已更新年级名称为“${name}”`);
    setEditGradeOpen(false);
    await load();
  });

  const handleDecreaseGrade = () => run(async () => {
    if (!selectedGrade) return;
    if (!window.confirm(`确定将“${selectedGrade.name}”统一降学年吗？班级和学生的年级会同步更新。`)) return;
    const result = await classService.decreaseSchoolGrade(selectedGrade.id);
    toast.success(`已降为 ${result.grade.grade}`, `更新 ${result.updatedClasses} 个班级、${result.updatedStudents} 名学生`);
    await load();
  });

  const handleAdvanceGrade = () => run(async () => {
    if (!selectedGrade) return;
    if (!window.confirm(`确定将“${selectedGrade.name}”统一升学年吗？班级和在册学生的年级会同步更新。`)) return;
    const result = await classService.advanceSchoolGrade(selectedGrade.id);
    toast.success(`已升为 ${result.grade.grade}`, `更新 ${result.updatedClasses} 个班级、${result.updatedStudents} 名学生`);
    await load();
  });

  const handleGraduateGrade = () => run(async () => {
    if (!selectedGrade) return;
    if (!window.confirm(`确定将“${selectedGrade.name}”标记为毕业吗？该年级全部在读学生会正常毕业，班级会统一封存。`)) return;
    const result = await classService.graduateSchoolGrade(selectedGrade.id);
    toast.success(`“${result.grade.name}”已毕业`, `封存 ${result.updatedClasses} 个班级、毕业 ${result.graduatedStudents} 名学生`);
    await load();
  });

  const commitRosterImport = async (
    rows: StudentRosterImportRow[],
    missingStudents: "keep" | "delete",
    matchStudentIds?: Record<string, string | null>,
  ) => {
    if (!teacher || !selectedGrade) return;
    const result = await classService.bulkImportStudents(
      selectedGrade.id,
      teacher.id,
      rows,
      { missingStudents, matchStudentIds },
    );
    const details = [
      `${result.updatedStudents} 名已有学生已更新`,
      `${result.createdStudents} 名学生已新增`,
      `${result.createdClasses} 个班级自动创建`,
    ];
    if (result.deletedStudents > 0) details.push(`${result.deletedStudents} 名旧名单学生已移入回收站`);
    if (result.skippedStudents > 0) details.push(`${result.skippedStudents} 条重复学号已跳过`);
    toast.success("学生名单导入完成", details.join("，"));
    await load();
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file || !teacher || !selectedGrade) return;
    await run(async () => {
      const rows = await readStudentRosterFile(file);
      const review = buildRosterImportReview(rows, students, classes, selectedGrade);
      const autoUnmatchedStudents = review.gradeStudents.filter(
        (student) => !review.autoMatchedStudentIds.includes(student.id),
      );
      if (review.reviewRows.length > 0 || autoUnmatchedStudents.length > 0) {
        setPendingRosterImport({ rows, review, resolutions: {} });
        return;
      }
      await commitRosterImport(rows, "keep");
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePendingRosterImport = (missingStudents: "keep" | "delete") => run(async () => {
    if (!pendingRosterImport) return;
    const unresolved = pendingRosterImport.review.reviewRows.filter(
      ({ rowIndex }) => !pendingRosterImport.resolutions[String(rowIndex)],
    );
    if (unresolved.length > 0) {
      toast.error("请先确认所有需要人工匹配的学生");
      return;
    }
    const matchStudentIds = Object.fromEntries(
      pendingRosterImport.review.reviewRows.map(({ rowIndex }) => {
        const value = pendingRosterImport.resolutions[String(rowIndex)];
        return [String(rowIndex), value === "__create__" ? null : value];
      }),
    );
    const { rows } = pendingRosterImport;
    setPendingRosterImport(null);
    await commitRosterImport(rows, missingStudents, matchStudentIds);
  });

  const handleDeleteClass = (item: SchoolClass) => run(async () => {
    if (!window.confirm(`确定删除“${item.name}”吗？班级和所属学生会进入回收站。`)) return;
    await classService.deleteClass(item.id, false);
    toast.success("班级已移入回收站");
    await load();
  });

  const openEditClass = (item: SchoolClass) => {
    const details = classTeacherDetails.get(item.id);
    setEditingClass(item);
    setEditClassName(item.name);
    setEditClassTypeId(item.classTypeId || "");
    setEditHomeroomTeacherId(details?.homeroom?.id || "");
    setEditSubjectTeacherIds(details?.subjectTeachers.map((entry) => entry.id) || []);
    setEditClassOpen(true);
  };

  const closeEditClass = () => {
    setEditClassOpen(false);
    setEditingClass(null);
  };

  const toggleSubjectTeacher = (teacherId: string) => {
    setEditSubjectTeacherIds((current) => current.includes(teacherId)
      ? current.filter((id) => id !== teacherId)
      : [...current, teacherId]);
  };

  const handleEditClass = () => run(async () => {
    if (!editingClass) return;
    const name = editClassName.trim();
    if (!name) {
      toast.error("请填写班级名称");
      return;
    }
    const duplicate = gradeClasses.find((item) => item.id !== editingClass.id && item.name === name);
    if (duplicate) {
      toast.error("班级名称已存在", `与“${duplicate.name}”重复`);
      return;
    }

    await classService.updateSchoolClass(editingClass.id, {
      name,
      classTypeId: editClassTypeId || null,
    });

    const selectedSubjectTeachers = new Set(editSubjectTeacherIds);
    await Promise.all(teachers.map(async (teacherItem) => {
      const teachingClassIds = assignedClassIds(teacherItem, schoolId, "teaching");
      const homeroomClassIds = assignedClassIds(teacherItem, schoolId, "homeroom");
      const nextTeachingClassIds = toggleAssignment(
        teachingClassIds,
        editingClass.id,
        selectedSubjectTeachers.has(teacherItem.id),
      );
      const nextHomeroomClassIds = toggleAssignment(
        homeroomClassIds,
        editingClass.id,
        teacherItem.id === editHomeroomTeacherId,
      );
      if (
        sameStringSet(teachingClassIds, nextTeachingClassIds)
        && sameStringSet(homeroomClassIds, nextHomeroomClassIds)
      ) return;
      await authService.updateTeacherTeachingProfile(teacherItem.id, {
        teachingClassIds: nextTeachingClassIds,
        homeroomClassIds: nextHomeroomClassIds,
      });
    }));

    toast.success(`已更新班级“${name}”`);
    closeEditClass();
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
    setEditStudentTransferClassId("");
    setEditStudentOpen(true);
  };

  const closeEditStudent = () => {
    setEditStudentOpen(false);
    setEditingStudent(null);
    setEditStudentTransferClassId("");
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
    closeEditStudent();
    await load();
  });

  const handleTransferStudent = () => run(async () => {
    if (!editingStudent) return;
    if (!editStudentTransferClassId) {
      toast.error("请选择目标班级");
      return;
    }
    const targetClass = classes.find((item) => item.id === editStudentTransferClassId);
    if (!targetClass || targetClass.status !== "active") {
      toast.error("目标班级不可用");
      return;
    }
    if (!window.confirm(`确定将“${editingStudent.name}”转入“${targetClass.name}”吗？历史学情数据会继续保留。`)) return;
    await classService.transferStudent(editingStudent.id, targetClass.id);
    toast.success(`“${editingStudent.name}”已转入“${targetClass.name}”`);
    closeEditStudent();
    const targetGrade = grades.find((item) => classBelongsToGrade(targetClass, item));
    if (targetGrade) setSelectedGradeId(targetGrade.id);
    setSelectedClassId(targetClass.id);
    await load();
  });

  const handleSuspendStudent = () => run(async () => {
    if (!editingStudent) return;
    if (!window.confirm(`确定将“${editingStudent.name}”设为休学吗？学生会移入休学回收站，学情数据完整保留。`)) return;
    await classService.suspendStudent(editingStudent.id);
    toast.success(`“${editingStudent.name}”已休学并移入休学回收站`);
    closeEditStudent();
    await load();
  });

  const handleTransferOutStudent = () => run(async () => {
    if (!editingStudent) return;
    if (!window.confirm(`确定将“${editingStudent.name}”设为转学离校吗？学生会移入转学回收站，历史学情数据完整保留。`)) return;
    await classService.transferOutStudent(editingStudent.id);
    toast.success(`“${editingStudent.name}”已转学并移入转学回收站`);
    closeEditStudent();
    await load();
  });

  const handleRestoreEnrollment = (item: Student) => run(async () => {
    const targetClass = classes.find((candidate) => candidate.id === item.classId && candidate.status === "active");
    if (!targetClass) {
      toast.error("原班级不可用", "请先恢复学生原班级后再恢复学籍");
      return;
    }
    await classService.resumeStudent(item.id, targetClass.id);
    toast.success(item.status === "suspended"
      ? `“${item.name}”已复学并恢复到“${targetClass.name}”`
      : `已撤销“${item.name}”的转学状态并恢复到“${targetClass.name}”`);
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

  const pendingUnmatchedStudents = pendingRosterImport
    ? unresolvedOldStudents(pendingRosterImport)
    : [];
  const selectedResolutionStudentIds = new Set(
    pendingRosterImport
      ? Object.values(pendingRosterImport.resolutions).filter((value) => value !== "__create__")
      : [],
  );
  const rosterReviewComplete = pendingRosterImport
    ? pendingRosterImport.review.reviewRows.every(
        ({ rowIndex }) => Boolean(pendingRosterImport.resolutions[String(rowIndex)]),
      )
    : false;

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Spinner size={28} /></div>;
  }

  return (
    <div>
      <PageHeader
        title="班级与学生"
        description="先建立年级，再维护班级和学生；支持 Excel 批量导入、年级升降、毕业与回收站恢复。"
        icon={<GraduationCap className="h-5 w-5" />}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/classes")}>
              <Layers className="h-4 w-4" />
              个人教学班
            </Button>
            <Button variant={rosterView === "deleted" ? "ink" : "outline"} onClick={() => setRosterView(rosterView === "deleted" ? "manage" : "deleted")}>
              <ArchiveRestore className="h-4 w-4" />
              删除回收站 ({recycleBin.classes.length + recycleBin.students.length})
            </Button>
            <Button variant={rosterView === "suspended" ? "ink" : "outline"} onClick={() => setRosterView(rosterView === "suspended" ? "manage" : "suspended")}>
              <PauseCircle className="h-4 w-4" />
              休学回收站 ({suspendedStudents.length})
            </Button>
            <Button variant={rosterView === "transferred" ? "ink" : "outline"} onClick={() => setRosterView(rosterView === "transferred" ? "manage" : "transferred")}>
              <School className="h-4 w-4" />
              转学回收站 ({transferredStudents.length})
            </Button>
            <Button variant="gold" onClick={() => setGradeModalOpen(true)}>
              <Plus className="h-4 w-4" />
              新建年级
            </Button>
          </div>
        }
      />

      {rosterView === "deleted" ? (
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold text-ink-900">班级与学生删除回收站</h2>
              <p className="mt-1 text-xs text-ink-500">恢复班级时会一并恢复随班级删除的学生；单独删除的学生可独立恢复。</p>
            </div>
            <Button variant="ghost" onClick={() => setRosterView("manage")}>返回管理</Button>
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
      ) : rosterView === "suspended" ? (
        <StudentLifecycleRecycleBin
          title="休学学生回收站"
          description="休学学生不会出现在在读名单中；所有历史学情数据完整保留，可恢复到原班级。"
          empty="暂无休学学生"
          students={suspendedStudents}
          classes={classes}
          dateField="suspendedAt"
          dateLabel="休学时间"
          restoreLabel="复学"
          working={working}
          onRestore={handleRestoreEnrollment}
          onBack={() => setRosterView("manage")}
        />
      ) : rosterView === "transferred" ? (
        <StudentLifecycleRecycleBin
          title="转学学生回收站"
          description="转学学生不会出现在在读名单中；历史学情数据完整保留，误操作时可撤销并恢复原班。"
          empty="暂无转学学生"
          students={transferredStudents}
          classes={classes}
          dateField="transferredAt"
          dateLabel="转学时间"
          restoreLabel="撤销转学"
          working={working}
          onRestore={handleRestoreEnrollment}
          onBack={() => setRosterView("manage")}
        />
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
                  <Button size="sm" variant="outline" onClick={openEditGrade}>
                    <Pencil className="h-3.5 w-3.5" />编辑年级
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDecreaseGrade} disabled={selectedGrade.grade === "高一" || selectedGrade.status === "graduated"} loading={working}>
                    <ArrowDown className="h-3.5 w-3.5" />降学年
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleAdvanceGrade} disabled={selectedGrade.grade === "高三" || selectedGrade.status === "graduated"} loading={working}>
                    <ArrowUp className="h-3.5 w-3.5" />升学年
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleGraduateGrade} disabled={selectedGrade.status === "graduated"} loading={working}>
                    <GraduationCap className="h-3.5 w-3.5" />毕业
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
                    {gradeClasses.map((item) => {
                      const classType = item.classTypeId ? classTypeById.get(item.classTypeId) : undefined;
                      const details = classTeacherDetails.get(item.id);
                      const teacherSummary = details?.subjectTeachers.length
                        ? details.subjectTeachers.map((entry) => `${entry.name}（${teacherSubject(entry, schoolId)}）`).join("、")
                        : "未设置";
                      const cardTitle = [
                        `${item.name} · ${item.studentCount} 名在读学生`,
                        `班型：${classType?.name || "未设置"}`,
                        `班主任：${details?.homeroom?.name || "未设置"}`,
                        `任课教师：${teacherSummary}`,
                      ].join("\n");
                      const selected = selectedClassId === item.id;
                      return (
                        <div
                          key={item.id}
                          style={classTypeStyle(classType?.color, selected)}
                          className={cn(
                            "group relative min-w-0 rounded-md border transition-shadow",
                            selected
                              ? "bg-gold-50 ring-2 ring-gold-300"
                              : "border-ink-200 bg-white hover:border-ink-300 hover:shadow-sm",
                          )}
                        >
                          <button
                            className="w-full min-w-0 px-2 py-1.5 pr-11 text-left"
                            onClick={() => setSelectedClassId(item.id)}
                            aria-label={`选择班级 ${item.name}`}
                            title={cardTitle}
                          >
                            <div className="truncate text-xs font-medium text-ink-900">{item.name}</div>
                            <div className="truncate text-[10px] text-ink-500">
                              {classType?.name || "未设置班型"} · {item.studentCount} 人
                            </div>
                          </button>
                          <button
                            className="absolute right-5 top-1 p-1 text-ink-400 transition-opacity hover:text-gold-700 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                            aria-label={`编辑班级 ${item.name}`}
                            title={`编辑班级 ${item.name}`}
                            onClick={() => openEditClass(item)}
                          >
                            <Pencil className="h-3 w-3" />
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
                      );
                    })}
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
                    {classStudents.map((item) => {
                      const subjectValue = item.subjectSelection?.trim() || "__empty__";
                      const studentTypeValue = item.isExternal ? "external" : "internal";
                      const subjectIsDifferent = commonSubjectSelection !== null && subjectValue !== commonSubjectSelection;
                      const studentTypeIsDifferent = commonStudentType !== null && studentTypeValue !== commonStudentType;
                      return (
                        <tr key={item.id} className="hover:bg-mist/60">
                          <td className="px-4 py-3 font-medium text-ink-900">{item.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-ink-600">{item.studentNo || "—"}</td>
                          <td className="px-4 py-3 text-ink-600">
                            <span
                              title={subjectIsDifferent ? "与本班多数学生的选科不同" : undefined}
                              className={cn(
                                "inline-flex rounded-md px-2 py-1",
                                subjectIsDifferent && "bg-amber-100 font-semibold text-amber-900 ring-1 ring-amber-300",
                              )}
                            >
                              {item.subjectSelection || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ink-600">{item.grade}</td>
                          <td className="px-4 py-3">
                            <span title={studentTypeIsDifferent ? "与本班多数学生的类型不同" : undefined}>
                              <Badge variant={studentTypeIsDifferent ? "amber" : "default"}>
                                {item.isExternal ? "借读生" : "本校生"}
                              </Badge>
                            </span>
                          </td>
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
                      );
                    })}
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
        open={editGradeOpen}
        onClose={() => setEditGradeOpen(false)}
        title="编辑年级"
        description={selectedGrade ? `${selectedGrade.gradYear}届 · 当前${gradeStatusLabel(selectedGrade)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditGradeOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleEditGrade} loading={working}>保存修改</Button>
          </>
        }
      >
        <Input
          label="年级名称"
          value={editGradeName}
          onChange={(event) => setEditGradeName(event.target.value)}
          hint="仅修改显示名称；届别和当前学年不会改变。"
          autoFocus
        />
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
        open={Boolean(pendingRosterImport)}
        onClose={() => setPendingRosterImport(null)}
        title={pendingRosterImport?.review.reviewRows.length
          ? "确认学生名单对应关系"
          : "发现旧名单中未匹配的学生"}
        description={pendingRosterImport
          ? pendingRosterImport.review.reviewRows.length > 0
            ? `需要人工确认 ${pendingRosterImport.review.reviewRows.length} 条记录；确认后还可决定 ${pendingUnmatchedStudents.length} 名未匹配旧学生是否保留。`
            : `新名单按姓名匹配后，有 ${pendingUnmatchedStudents.length} 名原有学生未出现。请选择保留，或将他们移入回收站。`
          : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingRosterImport(null)}>取消</Button>
            {pendingUnmatchedStudents.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handlePendingRosterImport("keep")}
                  loading={working}
                  disabled={!rosterReviewComplete}
                >
                  {pendingRosterImport.review.reviewRows.length > 0 ? "导入并保留旧学生" : "保留未匹配学生"}
                </Button>
                <Button
                  variant="ink"
                  onClick={() => handlePendingRosterImport("delete")}
                  loading={working}
                  disabled={!rosterReviewComplete}
                >
                  {pendingRosterImport.review.reviewRows.length > 0 ? "导入并移入回收站" : "删除未匹配学生"}
                </Button>
              </>
            ) : (
              <Button
                variant="gold"
                onClick={() => handlePendingRosterImport("keep")}
                loading={working}
                disabled={!rosterReviewComplete}
              >
                确认导入
              </Button>
            )}
          </>
        }
      >
        {pendingRosterImport && (
          <div className="space-y-5">
            {pendingRosterImport.review.reviewRows.length > 0 && (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-ink-800">人工匹配</div>
                  <div className="mt-1 text-xs text-ink-500">
                    同名但班级变化时请确认是否为原学生；姓名无法匹配时，可选择原名单中尚未匹配的学生（用于改名），或明确新增。
                  </div>
                </div>
                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {pendingRosterImport.review.reviewRows.map(({ rowIndex, row, reason }) => {
                    const currentValue = pendingRosterImport.resolutions[String(rowIndex)] || "";
                    const options = pendingRosterImport.review.gradeStudents
                      .filter((student) => (
                        !selectedResolutionStudentIds.has(student.id) || student.id === currentValue
                      ))
                      .map((student) => ({
                        value: student.id,
                        label: `${student.name} · ${classes.find((item) => item.id === student.classId)?.name || "未知班级"}${student.studentNo ? ` · ${student.studentNo}` : ""}`,
                      }));
                    return (
                      <div key={rowIndex} className="rounded-lg border border-ink-100 bg-mist/40 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-ink-900">
                            新名单：{row.name} · {row.className}{row.studentNo ? ` · ${row.studentNo}` : ""}
                          </span>
                          <Badge variant={reason === "sameName" ? "gold" : "ink"}>
                            {reason === "sameName" ? "同名需确认" : "姓名未匹配"}
                          </Badge>
                        </div>
                        <Select
                          label="对应原学生"
                          value={currentValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPendingRosterImport((current) => current ? {
                              ...current,
                              resolutions: { ...current.resolutions, [String(rowIndex)]: value },
                            } : current);
                          }}
                          options={[
                            { value: "", label: "请选择处理方式" },
                            { value: "__create__", label: `新增学生“${row.name}”` },
                            ...options,
                          ]}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pendingUnmatchedStudents.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-ink-800">仍未匹配的原学生</div>
                <div className="text-xs text-ink-500">导入时可整体保留，或移入回收站；之后仍可从回收站恢复。</div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-ink-100 bg-mist/50 px-3 py-2">
                  {pendingUnmatchedStudents.slice(0, 20).map((student) => (
                    <div key={student.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="font-medium text-ink-800">{student.name}</span>
                      <span className="text-xs text-ink-500">
                        {classes.find((item) => item.id === student.classId)?.name || "未知班级"}
                        {student.studentNo ? ` · ${student.studentNo}` : ""}
                      </span>
                    </div>
                  ))}
                  {pendingUnmatchedStudents.length > 20 && (
                    <div className="pt-2 text-xs text-ink-400">
                      另有 {pendingUnmatchedStudents.length - 20} 名未展示
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={editClassOpen}
        onClose={closeEditClass}
        title="编辑班级"
        description={editingClass ? `${editingClass.grade} · ${editingClass.name}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeEditClass}>取消</Button>
            <Button variant="gold" onClick={handleEditClass} loading={working}>保存修改</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="班级名称"
              value={editClassName}
              onChange={(event) => setEditClassName(event.target.value)}
              autoFocus
            />
            <Select
              label="班型"
              value={editClassTypeId}
              onChange={(event) => setEditClassTypeId(event.target.value)}
              placeholder="未设置班型"
              options={classTypes
                .filter((item) => item.enabled || item.id === editingClass?.classTypeId)
                .map((item) => ({ value: item.id, label: item.name }))}
            />
          </div>
          <Select
            label="班主任"
            value={editHomeroomTeacherId}
            onChange={(event) => setEditHomeroomTeacherId(event.target.value)}
            placeholder="未设置班主任"
            options={teachers.map((item) => ({
              value: item.id,
              label: `${item.name} · ${teacherSubject(item, schoolId)}`,
            }))}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">任课教师</legend>
            {teachers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-400">
                当前学校暂无可选教师
              </div>
            ) : (
              <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-ink-100 p-3 sm:grid-cols-2">
                {teachers.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                      editSubjectTeacherIds.includes(item.id)
                        ? "border-gold-300 bg-gold-50"
                        : "border-ink-200 bg-white hover:bg-mist",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={editSubjectTeacherIds.includes(item.id)}
                      onChange={() => toggleSubjectTeacher(item.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">{item.name}</span>
                      <span className="block truncate text-xs text-ink-400">{teacherSubject(item, schoolId)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-ink-400">班主任与任课教师可独立设置；保存后同步更新教师的教学资料。</p>
          </fieldset>
        </div>
      </Modal>

      <Modal
        open={editStudentOpen}
        onClose={closeEditStudent}
        title="编辑学生资料"
        description={selectedClass ? `所属班级：${selectedClass.name}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeEditStudent}>取消</Button>
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
          <div className="border-t border-ink-100 pt-4">
            <div className="mb-3">
              <div className="text-sm font-medium text-ink-800">学籍操作</div>
              <div className="mt-1 text-xs text-ink-500">转班、休学和转学独立执行，不会删除学生的历史学情数据。</div>
            </div>
            <div className="space-y-3 rounded-lg border border-ink-100 bg-mist/40 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <Select
                  label="转入班级"
                  value={editStudentTransferClassId}
                  onChange={(event) => setEditStudentTransferClassId(event.target.value)}
                  placeholder="请选择目标班级"
                  options={classes
                    .filter((item) => item.status === "active" && item.id !== editingStudent?.classId)
                    .map((item) => ({ value: item.id, label: `${item.grade} · ${item.name}` }))}
                />
                <Button variant="outline" onClick={handleTransferStudent} loading={working}>
                  <ArrowRightLeft className="h-3.5 w-3.5" />转班
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                <Button variant="outline" onClick={handleSuspendStudent} loading={working}>
                  <PauseCircle className="h-3.5 w-3.5" />休学
                </Button>
                <Button variant="outline" onClick={handleTransferOutStudent} loading={working}>
                  <School className="h-3.5 w-3.5" />转学
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StudentLifecycleRecycleBin({
  title,
  description,
  empty,
  students,
  classes,
  dateField,
  dateLabel,
  restoreLabel,
  working,
  onRestore,
  onBack,
}: {
  title: string;
  description: string;
  empty: string;
  students: Student[];
  classes: SchoolClass[];
  dateField: "suspendedAt" | "transferredAt";
  dateLabel: string;
  restoreLabel: string;
  working: boolean;
  onRestore: (student: Student) => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink-900">{title}</h2>
          <p className="mt-1 text-xs text-ink-500">{description}</p>
        </div>
        <Button variant="ghost" onClick={onBack}>返回管理</Button>
      </div>
      {students.length === 0 ? (
        <EmptyState icon={<ArchiveRestore className="h-7 w-7" />} title={empty} description="当前没有需要处理的学生。" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-100">
          <table className="min-w-[680px] w-full text-sm">
            <thead className="bg-mist text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">姓名</th>
                <th className="px-4 py-2.5 text-left font-medium">学号</th>
                <th className="px-4 py-2.5 text-left font-medium">原班级</th>
                <th className="px-4 py-2.5 text-left font-medium">{dateLabel}</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {students.map((student) => {
                const originalClass = classes.find((item) => item.id === student.classId);
                const restoreAvailable = originalClass?.status === "active";
                const dateValue = student[dateField];
                return (
                  <tr key={student.id} className="hover:bg-mist/60">
                    <td className="px-4 py-3 font-medium text-ink-900">{student.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-600">{student.studentNo || "—"}</td>
                    <td className="px-4 py-3 text-ink-600">{originalClass?.name || "原班级不可用"}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">{dateValue ? new Date(dateValue).toLocaleDateString("zh-CN") : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={working}
                        disabled={!restoreAvailable}
                        title={restoreAvailable ? undefined : "请先恢复学生原班级"}
                        onClick={() => onRestore(student)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />{restoreLabel}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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

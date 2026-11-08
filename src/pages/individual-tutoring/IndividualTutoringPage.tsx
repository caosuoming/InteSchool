import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { BookOpen, FilePlus2, Files, GraduationCap, Presentation, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MathHtml } from "@/components/ui/MathHtml";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { classService } from "@/services/class";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { analyticsService, type KnowledgeMastery, type StudentAnswerDetail } from "@/services/analytics";
import { lectureService } from "@/services/lecture";
import { examPaperService } from "@/services/examPaper";
import { basketService } from "@/services/basket";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { gradeService } from "@/services/grade";
import { chapterScope, flattenChapterTree, tutoringSuggestions } from "@/lib/individual-tutoring";
import { teacherResourceScopeId } from "@/lib/personal-resource-scope";
import type { Basket, ExamPaper, GradeQueryExam, KnowledgePoint, Lecture, LessonCourseware, PersonalClass, Question, Student, TreeNode } from "@/types";

const tabs = [
  { key: "classes", title: "个人教学班管理", icon: Users },
  { key: "prepare", title: "根据学情编讲义", icon: FilePlus2 },
  { key: "materials", title: "讲义作业管理", icon: Files },
  { key: "coursewares", title: "个别辅导课件", icon: Presentation },
] as const;
const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e);
type TutoringMaterial =
  | { type: "lecture"; item: Lecture; personalClassIds: string[] }
  | { type: "examPaper"; item: ExamPaper; personalClassIds: string[] };

export default function IndividualTutoringPage() {
  const { section } = useParams();
  const currentSection = tabs.find((tab) => tab.key === section)?.key;
  const navigate = useNavigate();
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const teacherId = teacher?.id || "";
  const schoolId = teacherResourceScopeId({ id: teacherId, schoolId: getCurrentAffiliation()?.schoolId || teacher?.schoolId });
  const [classes, setClasses] = useState<PersonalClass[]>([]);
  const [classId, setClassId] = useState("");
  const [materialsClassId, setMaterialsClassId] = useState("");
  const [studentsByClass, setStudentsByClass] = useState<Record<string, Student[]>>({});
  const [studentId, setStudentId] = useState("");
  const [mastery, setMastery] = useState<KnowledgeMastery[]>([]);
  const [studentMastery, setStudentMastery] = useState<KnowledgeMastery[]>([]);
  const [answerDetails, setAnswerDetails] = useState<StudentAnswerDetail[]>([]);
  const [gradeExams, setGradeExams] = useState<GradeQueryExam[]>([]);
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [chapterLoadFailed, setChapterLoadFailed] = useState(false);
  const [chapterSelections, setChapterSelections] = useState<Record<string, string[]>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [points, setPoints] = useState<KnowledgePoint[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [coursewares, setCoursewares] = useState<LessonCourseware[]>([]);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [basketId, setBasketId] = useState("");
  const [lectureTitle, setLectureTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!teacherId) return;
    let active = true;
    setLoading(true);
    classService.listPersonalClasses(teacherId)
      .then((result) => {
        if (!active) return;
        setClasses(result);
        setClassId((previous) => result.some((item) => item.id === previous) ? previous : result[0]?.id || "");
      })
      .catch((e) => toast.error("个人教学班加载失败", errorMessage(e)))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [teacherId]);

  useEffect(() => {
    if (!teacherId || !classId) return;
    let active = true;
    void classService.listStudentsByClass(classId).then((items) => {
      if (!active) return;
      setStudentsByClass((previous) => ({ ...previous, [classId]: items }));
      setStudentId((previous) => items.some((s) => s.id === previous) ? previous : "");
    }).catch((e) => toast.error("学生列表加载失败", errorMessage(e)));
    return () => { active = false; };
  }, [classId, teacherId]);

  const hasSelectedClass = Boolean(classId);
  useEffect(() => {
    if (!teacherId || !hasSelectedClass) return;
    let active = true;
    void Promise.allSettled([
      knowledgeService.getChapterTree(teacherId, false),
      knowledgeService.listKnowledgePoints(teacherId),
      questionService.listQuestions({ teacherId }),
      lectureService.listLectures({ teacherId }),
      examPaperService.listPapers({ teacherId }),
      lessonCoursewareService.listCoursewares({ teacherId }),
      basketService.listBaskets(teacherId),
    ]).then(([ch, kp, qs, ls, ps, cs, bs]) => {
      if (!active) return;
      if (ch.status === "fulfilled") { setChapterTree(ch.value); setChapterLoadFailed(false); }
      else { setChapterTree(null); setChapterLoadFailed(true); }
      if (kp.status === "fulfilled") setPoints(kp.value);
      if (qs.status === "fulfilled") setQuestions(qs.value);
      if (ls.status === "fulfilled") setLectures(ls.value);
      if (ps.status === "fulfilled") setPapers(ps.value);
      if (cs.status === "fulfilled") setCoursewares(cs.value);
      if (bs.status === "fulfilled") {
        setBaskets(bs.value);
        setBasketId((previous) => bs.value.some((b) => b.id === previous) ? previous : bs.value[0]?.id || "");
      }
      if ([ch, kp, qs, ls, ps, cs, bs].some((result) => result.status === "rejected")) {
        toast.error("部分个别辅导资源加载失败，请刷新重试");
      }
    });
    return () => { active = false; };
  }, [teacherId, schoolId, hasSelectedClass]);

  const currentClass = classes.find((c) => c.id === classId);
  const students = studentsByClass[classId] || [];
  const studentIds = studentsByClass[classId] ? students.map((s) => s.id) : currentClass?.studentIds || [];
  const studentIdsKey = studentIds.join("|");
  useEffect(() => {
    if (!classId) return;
    let active = true;
    setLoadingProgress(true);
    setMastery([]);
    if (!studentIdsKey) {
      setLoadingProgress(false);
      return;
    }
    void analyticsService.getKnowledgeMastery(studentIdsKey.split("|"), schoolId)
      .then((items) => { if (active) setMastery(items); })
      .catch((e) => { if (active) toast.error("学情加载失败", errorMessage(e)); })
      .finally(() => { if (active) setLoadingProgress(false); });
    return () => { active = false; };
  }, [classId, schoolId, studentIdsKey]);

  useEffect(() => {
    if (!studentId) {
      setStudentMastery([]);
      setAnswerDetails([]);
      setGradeExams([]);
      return;
    }
    let active = true;
    void Promise.all([
      analyticsService.getKnowledgeMastery([studentId], schoolId),
      analyticsService.getStudentAnswerDetails([studentId]),
      gradeService.getQueryData().catch(() => null),
    ]).then(([m, details, grades]) => {
      if (!active) return;
      setStudentMastery(m);
      setAnswerDetails(details);
      setGradeExams(grades?.exams.filter((exam) => exam.records.some((record) => record.studentId === studentId)) || []);
    }).catch((e) => { if (active) toast.error("学生学情加载失败", errorMessage(e)); });
    return () => { active = false; };
  }, [studentId, schoolId]);

  const chapters = useMemo(() => flattenChapterTree(chapterTree), [chapterTree]);
  const chapterIdsAvailable = useMemo(() => new Set(chapters.map((chapter) => chapter.id)), [chapters]);
  const chapterIds = useMemo(() =>
    (chapterSelections[classId] ?? currentClass?.tutoringChapterIds ?? [])
      .filter((id) => chapterIdsAvailable.has(id)),
  [chapterSelections, classId, currentClass?.tutoringChapterIds, chapterIdsAvailable]);
  const scope = useMemo(() => chapterScope(chapters, chapterIds), [chapters, chapterIds]);
  const suggestions = useMemo(() => tutoringSuggestions(questions, scope, points, mastery), [questions, scope, points, mastery]);
  const chosen = suggestions.questions.filter((question) => selectedQuestionIds.includes(question.id));
  const classIds = new Set(classes.map((cls) => cls.id));
  const personalLectures = lectures.filter((lecture) => lecture.classIds.some((id) => classIds.has(id)));
  const personalPapers = papers.filter((paper) => paper.managementCategory !== "exam"
    && paper.classIds?.some((id) => classIds.has(id)));
  const materials: TutoringMaterial[] = [
    ...personalLectures.map((item) => ({
      type: "lecture" as const, item, personalClassIds: item.classIds.filter((id) => classIds.has(id)),
    })),
    ...personalPapers.map((item) => ({
      type: "examPaper" as const, item, personalClassIds: (item.classIds || []).filter((id) => classIds.has(id)),
    })),
  ];
  const visibleMaterials = materials.filter((material) => !materialsClassId || material.personalClassIds.includes(materialsClassId))
    .sort((a, b) => new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime());
  const isPushed = (material: TutoringMaterial, targetClassIds = material.personalClassIds) =>
    targetClassIds.every((id) => coursewares.some((courseware) => courseware.sourceType === material.type
      && courseware.sourceId === material.item.id && courseware.classIds.includes(id)));
  const filteredCoursewares = coursewares.filter((courseware) => courseware.classIds.includes(classId)
    && materials.some((material) => material.type === courseware.sourceType && material.item.id === courseware.sourceId
      && material.personalClassIds.includes(classId)));
  const pendingMaterials = materials.filter((material) => material.personalClassIds.includes(classId)
    && !isPushed(material, [classId]));

  const updateChapterSelection = (ids: string[]) => {
    if (!classId) return;
    const next = [...new Set(ids)].filter((id) => chapterIdsAvailable.has(id));
    setChapterSelections((previous) => ({ ...previous, [classId]: next }));
    setSelectedQuestionIds([]);
    const selectedClassId = classId;
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const updated = await classService.savePersonalClassChapterSelection(selectedClassId, next);
        setClasses((previous) => previous.map((item) => item.id === selectedClassId ? updated : item));
      } catch (e) {
        toast.error("章节课选择自动保存失败", errorMessage(e));
      }
    });
  };

  const pushMaterial = async (material: TutoringMaterial) => {
    if (!teacher || busy) return;
    const pendingClassIds = material.personalClassIds.filter((id) => !isPushed(material, [id]));
    if (!pendingClassIds.length) return;
    setBusy(true);
    try {
      const updated = material.type === "lecture"
        ? await lessonCoursewareService.createFromLecture(teacher.id, material.item.schoolId, material.item.id, [], pendingClassIds)
        : await lessonCoursewareService.createFromExamPaper(teacher.id, material.item.schoolId, material.item.id, [], pendingClassIds);
      setCoursewares((previous) => [updated, ...previous]);
      setClassId(pendingClassIds[0]);
      toast.success("已推送到个别辅导课件");
      navigate("/individual-tutoring/coursewares");
    } catch (e) {
      toast.error("推送失败", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const addToBasket = async () => {
    if (!basketId || chosen.length === 0 || busy) return;
    setBusy(true);
    try {
      const basket = baskets.find((item) => item.id === basketId);
      for (const q of chosen.filter((item) => !basket?.questionIds.includes(item.id))) {
        await basketService.addQuestion(basketId, q.id);
      }
      setBaskets(await basketService.listBaskets(teacherId));
      toast.success(`已将所选 ${chosen.length} 道题加入资源篮`);
    } catch (e) { toast.error("加入资源篮失败", errorMessage(e)); }
    finally { setBusy(false); }
  };

  const createLecture = async () => {
    if (!teacher || !currentClass || chapterIds.length === 0 || chosen.length === 0 || busy) return;
    setBusy(true);
    try {
      const chapterTitle = chapterIds.length === 1 ? chapters.find((chapter) => chapter.id === chapterIds[0])?.name : "多章节";
      const name = lectureTitle.trim() || `${currentClass.name} · ${chapterTitle || "个别辅导"}讲义`;
      const year = new Date().getFullYear();
      const startYear = new Date().getMonth() >= 8 ? year : year - 1;
      const lecture = await lectureService.createLecture(teacher.id, schoolId, {
        title: name,
        description: `根据${currentClass.name}的知识点学情选题生成`,
        chapterIds: [...new Set(chosen.flatMap((q) => q.chapterIds.filter((id) => scope.has(id))))],
        knowledgePointIds: [...new Set(chosen.flatMap((q) => q.knowledgePointIds))],
        grade: students[0]?.grade || "",
        schoolYear: `${startYear}-${startYear + 1}`,
        classIds: [classId],
        studentIds: [],
        sections: [
          { id: crypto.randomUUID(), title: name, type: "chapter", content: "", children: [] },
          ...chosen.map((q) => ({ id: crypto.randomUUID(), title: "练习题", type: "question" as const, content: q.stem, questionId: q.id, children: [] })),
        ],
      });
      setLectures((previous) => [lecture, ...previous]);
      setSelectedQuestionIds([]);
      toast.success("已创建讲义，可进一步编辑和排版");
      navigate(`/lectures/${lecture.id}/edit`);
    } catch (e) { toast.error("创建讲义失败", errorMessage(e)); }
    finally { setBusy(false); }
  };

  if (!currentSection) return <Navigate to="/individual-tutoring/classes" replace />;
  if (loading) return <div className="py-16 flex justify-center"><Spinner /></div>;
  if (!classes.length) return (
    <Card className="text-center space-y-4">
      <h2 className="font-semibold text-ink-900">暂无个人教学班</h2>
      <p className="text-sm text-ink-500">先在后台设置创建个人教学班，随后即可使用个别辅导。</p>
      <Button onClick={() => navigate("/classes")}>前往个人教学班管理</Button>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="个别辅导" description="针对个人教学班的学情选题、讲义与课件管理" icon={<GraduationCap className="h-5 w-5" />} />
      <div className="flex flex-wrap gap-2" aria-label="个别辅导栏目">
        {tabs.map((tab) => (
          <Link key={tab.key} to={`/individual-tutoring/${tab.key}`}
            aria-current={currentSection === tab.key ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${currentSection === tab.key ? "bg-gold-50 text-gold-800 border-gold-300 font-semibold" : "border-ink-200 text-ink-600 hover:border-gold-300"}`}>
            <tab.icon className="h-4 w-4" />{tab.title}
          </Link>
        ))}
      </div>
      {currentSection !== "materials" && <Card className="max-w-xl">
        <Select label="个人教学班" value={classId} onChange={(e) => { setClassId(e.target.value); setSelectedQuestionIds([]); setStudentId(""); }}
          options={classes.map((item) => ({ value: item.id, label: item.name }))} />
      </Card>}

      {currentSection === "classes" && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold text-ink-900">{currentClass?.name}</h2><p className="text-sm text-ink-500">{currentClass?.description || "个人教学班"} · {students.length} 名学生</p></div>
            <Button onClick={() => navigate("/classes")}>新建或管理教学班</Button>
          </Card>
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Card className="space-y-2">
              <h3 className="font-medium text-ink-900 mb-3">班级学生</h3>
              {students.length ? students.map((student) => (
                <button key={student.id} type="button" onClick={() => setStudentId(student.id)}
                  className={`block w-full text-left rounded-lg px-3 py-2 text-sm ${studentId === student.id ? "bg-gold-50 text-gold-800" : "hover:bg-mist text-ink-700"}`}>
                  {student.name}<span className="block text-xs text-ink-400">{student.grade || "未填写年级"}</span>
                </button>
              )) : <p className="text-sm text-ink-400">暂无学生，可在班级管理中添加。</p>}
            </Card>
            <Card className="space-y-4">
              {!studentId ? <p className="text-sm text-ink-500">选择学生，查看其历史考试成绩及知识点掌握情况。</p> : <>
                <h3 className="font-semibold text-ink-900">{students.find((s) => s.id === studentId)?.name} · 学情档案</h3>
                <h4 className="text-sm font-medium">历次考试成绩</h4>
                {gradeExams.length ? <div className="space-y-2">{gradeExams.map((exam) => {
                  const record = exam.records.find((item) => item.studentId === studentId);
                  return <div key={exam.id} className="border border-ink-100 rounded-lg p-3 text-sm">
                    <div className="font-medium">{exam.name}<span className="ml-2 text-xs text-ink-400">{exam.examDate || ""}</span></div>
                    <div className="text-ink-600 mt-1">{Object.entries(record?.scores || {}).map(([subject, score]) => `${subject} ${score ?? "—"}`).join(" · ") || "暂无分数"}</div>
                  </div>;
                })}</div> : <p className="text-sm text-ink-400">暂无可访问的历史考试成绩</p>}
                <h4 className="text-sm font-medium">知识点掌握情况</h4>
                {studentMastery.length ? <div className="grid gap-2 sm:grid-cols-2">{studentMastery.map((item) => (
                  <div key={item.knowledgePointId} className="border border-ink-100 rounded-lg p-2.5 text-sm flex items-center justify-between gap-2">
                    <span className="truncate">{item.knowledgePointName}</span>
                    <span className="shrink-0 text-xs text-ink-500">{{ mastered: "已掌握", basic: "基本掌握", weak: "薄弱", untrained: "未训练" }[item.masteryLevel]}</span>
                  </div>
                ))}</div> : <p className="text-sm text-ink-400">暂无知识点学情数据</p>}
                <p className="text-xs text-ink-400">已记录答题 {answerDetails.length} 条</p>
              </>}
            </Card>
          </div>
        </div>
      )}

      {currentSection === "prepare" && (
        <div className="space-y-4">
          <Card className="max-w-xl space-y-3">
            <h2 className="font-semibold text-ink-900">选择章节课范围</h2>
            {chapterTree ? <SearchableTree key={classId} data={chapterTree} title="章节课目录"
              checkable checkedIds={chapterIds} onCheck={updateChapterSelection}
              cascadeCheck={false} showCount={false} expandLevel={2}
              searchPlaceholder="搜索章节课目录..." className="rounded-lg border border-ink-200"
            /> : chapterLoadFailed
              ? <p role="alert" className="text-sm text-red-600">章节课目录加载失败，请刷新重试</p>
              : <Spinner />}
            <p className="text-xs text-ink-500">已选择 {chapterIds.length} 个节点，可复选并展开或折叠。范围包含所选节点的全部子章节，选择将自动保存至当前个人教学班，下次打开继续使用。</p>
            {!chapterIds.length && chapterTree && <p className="text-xs text-ink-400">请从知识树章节课目录中勾选至少一个节点。</p>}
          </Card>
          {chapterIds.length > 0 && <>
            <Card className="space-y-3">
              <h2 className="font-semibold text-ink-900">班级薄弱与未训练知识点</h2>
              {loadingProgress ? <Spinner /> : suggestions.topics.length ? <div className="flex flex-wrap gap-2">
                {suggestions.topics.map((topic) => <span key={topic.id} className={`rounded-full px-3 py-1 text-xs ${topic.level === "weak" ? "bg-red-50 text-red-700" : "bg-mist text-ink-600"}`}>
                  {topic.name} · {topic.level === "weak" ? "薄弱" : "未训练"} · {topic.questionCount} 题
                </span>)}
              </div> : <p className="text-sm text-ink-500">该章节没有匹配的薄弱或未训练知识点及题目。</p>}
            </Card>
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-ink-900">推荐试题（{suggestions.questions.length}）</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedQuestionIds(suggestions.questions.map((q) => q.id))}>全选</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedQuestionIds([])}>清空</Button>
                </div>
              </div>
              {suggestions.questions.map((q) => <label key={q.id} className="flex items-start gap-3 border-t border-ink-100 pt-3 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={selectedQuestionIds.includes(q.id)} onChange={(e) => setSelectedQuestionIds((previous) => e.target.checked ? [...previous, q.id] : previous.filter((id) => id !== q.id))} />
                <div className="min-w-0 flex-1 text-sm text-ink-800">
                  <MathHtml>{q.stem}</MathHtml>
                  {q.options?.map((option, index) => <div key={index} className="mt-1 text-xs text-ink-600 flex gap-1">
                    <span>{String.fromCharCode(65 + index)}.</span><MathHtml className="min-w-0">{option}</MathHtml>
                  </div>)}
                  <span className="block mt-1 text-xs text-ink-400">{q.knowledgePointIds.map((id) => points.find((p) => p.id === id)?.name).filter(Boolean).join(" · ") || "未关联知识点"}</span>
                </div>
              </label>)}
              {!suggestions.questions.length && <p className="text-sm text-ink-400">暂无可选试题</p>}
              <div className="pt-4 border-t border-ink-100 space-y-3">
                <p className="text-sm text-ink-600">已选择 {chosen.length} 道题</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="min-w-52 flex-1"><Select label="目标资源篮" value={basketId} options={baskets.map((item) => ({ value: item.id, label: item.name }))} placeholder="选择资源篮" onChange={(e) => setBasketId(e.target.value)} /></div>
                  <Button disabled={!basketId || !chosen.length || busy} variant="outline" onClick={() => void addToBasket()}>加入资源篮</Button>
                  <Button variant="ghost" onClick={() => navigate("/baskets")}>管理资源篮</Button>
                </div>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="min-w-52 flex-1"><Input label="新讲义名称" value={lectureTitle} placeholder={`${currentClass?.name || "个别辅导"}专题讲义`} onChange={(e) => setLectureTitle(e.target.value)} /></div>
                  <Button disabled={!chosen.length || busy} onClick={() => void createLecture()}>生成讲义</Button>
                </div>
              </div>
            </Card>
          </>}
        </div>
      )}

      {currentSection === "materials" && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold text-ink-900">个人教学班讲义与作业（{visibleMaterials.length}）</h2>
              <p className="text-sm text-ink-500 mt-1">汇总所有个人教学班的讲义和作业，可按班级筛选并推送为上课课件。</p>
            </div>
            <div className="w-full max-w-64">
              <Select label="筛选班级" value={materialsClassId} onChange={(e) => setMaterialsClassId(e.target.value)}
                options={[{ value: "", label: "全部个人教学班" }, ...classes.map((item) => ({ value: item.id, label: item.name }))]} />
            </div>
          </div>
          {visibleMaterials.length ? <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-ink-200 text-ink-500">
                <tr><th className="py-3 pr-4 font-medium">文件名称</th><th className="py-3 pr-4 font-medium">类型</th><th className="py-3 pr-4 font-medium">适用班级</th><th className="py-3 font-medium">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visibleMaterials.map((material) => <tr key={`${material.type}-${material.item.id}`}>
                  <td className="py-3 pr-4 font-medium text-ink-800">{material.item.title}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{material.type === "lecture" ? "讲义" : "作业"}</td>
                  <td className="py-3 pr-4 text-ink-600">{material.personalClassIds.map((id) => classes.find((cls) => cls.id === id)?.name).filter(Boolean).join("、")}</td>
                  <td className="py-3 whitespace-nowrap">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(material.type === "lecture"
                        ? `/lectures/${material.item.id}/edit` : `/exam-papers/${material.item.id}`)}>查看/编辑</Button>
                      <Button size="sm" disabled={busy || isPushed(material)} onClick={() => void pushMaterial(material)}>
                        {isPushed(material) ? "已推送" : "推送到个别辅导课件"}
                      </Button>
                    </div>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div> : <p className="text-sm text-ink-400">暂无关联的讲义或作业。可先根据学情生成讲义，或为个人教学班布置作业。</p>}
        </Card>
      )}

      {currentSection === "coursewares" && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="font-semibold text-ink-900">已推送的个别辅导课件（{filteredCoursewares.length}）</h2>
            {filteredCoursewares.map((courseware) => <div key={courseware.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
              <div><div className="font-medium text-sm">{courseware.title}</div><div className="text-xs text-ink-400">{courseware.slides.length} 页 · {courseware.status === "published" ? "已发布" : "草稿"}</div></div>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => navigate(`/my-lessons/${courseware.id}/edit`)}>二次编辑</Button>
                <Button size="sm" onClick={() => navigate(`/my-lessons/${courseware.id}/edit?preview=1`)}>上课</Button></div>
            </div>)}
            {!filteredCoursewares.length && <p className="text-sm text-ink-400">暂无已推送课件</p>}
          </Card>
          <Card className="space-y-3">
            <h2 className="font-semibold text-ink-900">未推送的讲义与作业（{pendingMaterials.length}）</h2>
            {pendingMaterials.map((material) => <div key={`${material.type}-${material.item.id}`} className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
              <span className="font-medium text-sm truncate">{material.item.title}</span>
              <Button size="sm" disabled={busy} onClick={() => void pushMaterial(material)}>生成上课课件</Button>
            </div>)}
            {!pendingMaterials.length && <p className="text-sm text-ink-400">没有待推送的讲义或作业</p>}
          </Card>
        </div>
      )}
      <div className="text-xs text-ink-400 flex items-center gap-2"><BookOpen className="h-4 w-4" />讲义与课件保存到现有资源库，并沿用原有编辑和上课能力。</div>
    </div>
  );
}

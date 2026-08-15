import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpenCheck, LogOut, School, UserRound, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { BrandMark } from "@/components/brand/BrandMark";
import { Badge, Button, Card, Select, Spinner } from "@/components/ui";
import {
  parentService,
  type ParentAccount,
  type ParentChild,
  type ParentGradeResult,
  type ParentLearningItem,
} from "@/services/parent";

type PortalTab = "grades" | "learning";
type LearningTab = "chapter" | "knowledge";

const masteryLabel: Record<ParentLearningItem["masteryLevel"], string> = {
  mastered: "已掌握",
  basic: "基本掌握",
  weak: "需巩固",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function ParentPortalPage() {
  const navigate = useNavigate();
  const [parent, setParent] = useState<ParentAccount | null>(null);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [grades, setGrades] = useState<ParentGradeResult[]>([]);
  const [learning, setLearning] = useState<{ chapter: ParentLearningItem[]; knowledge: ParentLearningItem[] }>({ chapter: [], knowledge: [] });
  const [tab, setTab] = useState<PortalTab>("grades");
  const [learningTab, setLearningTab] = useState<LearningTab>("chapter");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await parentService.init();
        if (!account) {
          navigate("/login", { replace: true });
          return;
        }
        const items = await parentService.listChildren();
        if (!active) return;
        setParent(account);
        setChildren(items);
        const first = items[0];
        setSelectedSchoolId(first?.schoolId || "");
        setSelectedChildId(first?.id || "");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "家长信息加载失败");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  const schools = useMemo(() => {
    const map = new Map<string, string>();
    children.forEach((child) => map.set(child.schoolId, child.schoolName));
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [children]);

  const schoolChildren = useMemo(
    () => children.filter((child) => child.schoolId === selectedSchoolId),
    [children, selectedSchoolId],
  );
  const selectedChild = children.find((child) => child.id === selectedChildId) || null;

  useEffect(() => {
    if (!selectedSchoolId) return;
    if (!schoolChildren.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(schoolChildren[0]?.id || "");
    }
  }, [schoolChildren, selectedChildId, selectedSchoolId]);

  useEffect(() => {
    if (!selectedChildId) {
      setGrades([]);
      setLearning({ chapter: [], knowledge: [] });
      return;
    }
    let active = true;
    setDetailLoading(true);
    setError("");
    void Promise.all([
      parentService.listGrades(selectedChildId),
      parentService.getLearning(selectedChildId),
    ]).then(([gradeItems, learningItems]) => {
      if (!active) return;
      setGrades(gradeItems);
      setLearning(learningItems);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "学生信息加载失败");
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [selectedChildId]);

  const logout = async () => {
    await parentService.logout();
    navigate("/login", { replace: true });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-mist"><Spinner size={28} /></div>;
  }

  const learningRows = learning[learningTab];

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <div>
              <div className="font-serif text-xl font-bold text-ink-900">家长中心</div>
              <div className="text-xs text-ink-500">成绩与学情</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-ink-800">{parent?.name}</div>
              <div className="text-xs text-ink-400">{parent?.phone}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}><LogOut className="h-4 w-4" />退出</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-5 py-6">
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="学校"
              value={selectedSchoolId}
              onChange={(event) => setSelectedSchoolId(event.target.value)}
              options={schools}
            />
            <Select
              label="孩子"
              value={selectedChildId}
              onChange={(event) => setSelectedChildId(event.target.value)}
              options={schoolChildren.map((child) => ({
                value: child.id,
                label: `${child.name} · ${child.className}${child.studentNo ? ` · ${child.studentNo}` : ""}`,
              }))}
            />
          </div>
          {selectedChild && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-600">
              <School className="h-4 w-4" />{selectedChild.schoolName}
              <span className="text-ink-300">/</span>
              <Users className="h-4 w-4" />{selectedChild.className}
              <span className="text-ink-300">/</span>
              <UserRound className="h-4 w-4" />{selectedChild.name}
            </div>
          )}
        </Card>

        <div className="flex gap-2">
          <Button variant={tab === "grades" ? "ink" : "outline"} onClick={() => setTab("grades")}>
            <BarChart3 className="h-4 w-4" />已发布成绩
          </Button>
          <Button variant={tab === "learning" ? "ink" : "outline"} onClick={() => setTab("learning")}>
            <BookOpenCheck className="h-4 w-4" />学情掌握
          </Button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {detailLoading ? (
          <div className="flex min-h-56 items-center justify-center"><Spinner size={24} /></div>
        ) : tab === "grades" ? (
          <div className="space-y-4">
            {grades.length === 0 ? (
              <Card className="py-12 text-center text-sm text-ink-500">学校尚未向家长发布该学生的考试成绩。</Card>
            ) : grades.map((exam) => (
              <Card key={exam.examId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-lg font-semibold text-ink-900">{exam.examName}</h2>
                    <div className="mt-1 text-xs text-ink-500">
                      {exam.cohortLabel}{exam.examDate ? ` · ${exam.examDate}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="ink">班级第 {exam.result.classRank} 名</Badge>
                    <Badge variant="gold">年级第 {exam.result.gradeRank} 名</Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {exam.subjects.map((subject) => {
                    const assigned = exam.result.assignedScores[subject];
                    const raw = exam.result.scores[subject];
                    const value = assigned ?? raw;
                    return (
                      <div key={subject} className="rounded-lg border border-ink-100 bg-mist/40 px-3 py-2">
                        <div className="text-xs text-ink-500">{subject}</div>
                        <div className="mt-1 text-xl font-semibold text-ink-900">{value ?? "—"}</div>
                      </div>
                    );
                  })}
                  <div className="rounded-lg border border-gold-200 bg-gold-50 px-3 py-2">
                    <div className="text-xs text-gold-800">总分</div>
                    <div className="mt-1 text-xl font-semibold text-gold-900">{exam.result.assignedTotal}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg font-semibold text-ink-900">训练内容掌握情况</h2>
                <p className="mt-1 text-xs text-ink-500">仅展示已有训练记录的内容，并与同年级学生整体正确率比较。</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={learningTab === "chapter" ? "ink" : "outline"} onClick={() => setLearningTab("chapter")}>章节</Button>
                <Button size="sm" variant={learningTab === "knowledge" ? "ink" : "outline"} onClick={() => setLearningTab("knowledge")}>知识点</Button>
              </div>
            </div>
            {learningRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-500">暂无已训练的{learningTab === "chapter" ? "章节" : "知识点"}数据。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="border-b border-ink-100 text-left text-xs text-ink-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">内容</th>
                      <th className="px-3 py-2 text-center font-medium">训练次数</th>
                      <th className="px-3 py-2 text-center font-medium">个人掌握</th>
                      <th className="px-3 py-2 text-center font-medium">年级掌握</th>
                      <th className="px-3 py-2 text-center font-medium">差异</th>
                    </tr>
                  </thead>
                  <tbody>
                    {learningRows.map((item) => (
                      <tr key={item.id} className="border-b border-ink-50 last:border-0">
                        <td className="px-3 py-3">
                          <div className="font-medium text-ink-800">{item.name}</div>
                          <div className="mt-1 text-xs text-ink-400">{masteryLabel[item.masteryLevel]}</div>
                        </td>
                        <td className="px-3 py-3 text-center">{item.totalAttempts}</td>
                        <td className="px-3 py-3 text-center font-medium">{percent(item.correctRate)}</td>
                        <td className="px-3 py-3 text-center">{percent(item.gradeCorrectRate)}</td>
                        <td className={`px-3 py-3 text-center font-medium ${item.gap >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {item.gap >= 0 ? "+" : ""}{Math.round(item.gap * 100)} 个百分点
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}

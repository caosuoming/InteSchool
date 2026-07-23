import { useEffect, useState } from "react";
import {
  BarChart3, TrendingUp, Users, FileText, Award, AlertCircle,
  MessageSquare, Activity,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { analyticsService } from "@/services/analytics";
import { knowledgeService } from "@/services/knowledge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Question, Student, Chapter, KnowledgePoint } from "@/types";
import { cn } from "@/lib/utils";

interface QuestionStat {
  question: Question;
  answerCount: number;
  correctRate: number;
  studentIds: string[];
}

interface StudentStat {
  student: Student;
  answerCount: number;
  correctRate: number;
}

export default function AnalyticsPage() {
  const { teacher } = useAuthStore();
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [points, setPoints] = useState<KnowledgePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!teacher) return;
      const [qs, ss, chs, kps] = await Promise.all([
        analyticsService.getQuestionStats(teacher.schoolId!),
        analyticsService.getStudentStats(teacher.schoolId!),
        knowledgeService.listChapters(teacher.schoolId!),
        knowledgeService.listKnowledgePoints(teacher.schoolId!),
      ]);
      setQuestionStats(qs);
      setStudentStats(ss);
      setChapters(chs);
      setPoints(kps);
      setLoading(false);
    };
    load();
  }, [teacher]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  const totalQuestions = questionStats.length;
  const usedQuestions = questionStats.filter((q) => q.question.usageCount > 0).length;
  const totalAnswers = questionStats.reduce((sum, q) => sum + q.answerCount, 0);
  const avgCorrectRate = studentStats.length
    ? Math.round(
        (studentStats.reduce((sum, s) => sum + s.correctRate, 0) / studentStats.length) * 100,
      ) / 100
    : 0;

  const topUsedQuestions = [...questionStats]
    .sort((a, b) => b.question.usageCount - a.question.usageCount)
    .slice(0, 8);

  const lowCorrectQuestions = questionStats
    .filter((q) => q.answerCount > 0)
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 5);

  const topStudents = [...studentStats].sort((a, b) => b.correctRate - a.correctRate).slice(0, 5);
  const weakStudents = [...studentStats]
    .filter((s) => s.answerCount > 0)
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 5);

  const getChapterName = (id: string) => chapters.find((c) => c.id === id)?.name || "";
  const getPointName = (id: string) => points.find((p) => p.id === id)?.name || "";

  const summaryCards = [
    {
      label: "题目总量",
      value: totalQuestions,
      icon: FileText,
      color: "text-gold-600",
      bg: "bg-gold-50",
    },
    {
      label: "已使用题目",
      value: `${usedQuestions}/${totalQuestions}`,
      icon: Activity,
      color: "text-teal-600",
      bg: "bg-teal-50",
    },
    {
      label: "学生答题总数",
      value: totalAnswers,
      icon: TrendingUp,
      color: "text-ink-700",
      bg: "bg-ink-100",
    },
    {
      label: "平均正确率",
      value: `${Math.round(avgCorrectRate * 100)}%`,
      icon: Award,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <div>
      <PageHeader
        title="使用分析"
        description="题目使用频次、学生答题情况、薄弱知识点一目了然"
        icon={<BarChart3 className="w-5 h-5" />}
      />

      {/* 数据概览 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-ink-500 mb-1">{c.label}</div>
                  <div className="font-serif text-2xl font-bold text-ink-900">{c.value}</div>
                </div>
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", c.bg)}>
                  <Icon className={cn("w-4 h-4", c.color)} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 题目使用排行 */}
        <Card>
          <CardHeader
            title="题目使用排行 TOP 8"
            subtitle="按使用次数排序"
            action={<TrendingUp className="w-4 h-4 text-gold-600" />}
          />
          <div className="space-y-2">
            {topUsedQuestions.length === 0 ? (
              <div className="text-center py-8 text-sm text-ink-400">暂无数据</div>
            ) : (
              topUsedQuestions.map((stat, idx) => (
                <div
                  key={stat.question.id}
                  className="flex items-center gap-3 p-2.5 rounded-md hover:bg-mist transition-colors"
                >
                  <div className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center font-mono text-xs font-bold flex-shrink-0",
                    idx < 3 ? "bg-gold-400 text-ink-900" : "bg-ink-100 text-ink-600",
                  )}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-900 truncate">{stat.question.stem}</div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {stat.question.chapterIds.slice(0, 1).map(getChapterName)}
                      {stat.question.chapterIds.length > 1 && " ..."}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm font-semibold text-ink-900">{stat.question.usageCount}</div>
                    <div className="text-[10px] text-ink-400">次使用</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* 正确率较低的题目 */}
        <Card>
          <CardHeader
            title="学生薄弱题目"
            subtitle="正确率最低的 5 道"
            action={<AlertCircle className="w-4 h-4 text-red-500" />}
          />
          <div className="space-y-2">
            {lowCorrectQuestions.length === 0 ? (
              <div className="text-center py-8 text-sm text-ink-400">暂无答题数据</div>
            ) : (
              lowCorrectQuestions.map((stat) => (
                <div
                  key={stat.question.id}
                  className="p-3 rounded-md border border-ink-100 hover:bg-mist"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900 line-clamp-2">{stat.question.stem}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {stat.question.knowledgePointIds.slice(0, 2).map((id) => (
                          <Badge key={id} variant="teal">{getPointName(id)}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={cn(
                        "font-mono text-lg font-bold",
                        stat.correctRate < 0.4 ? "text-red-600" : stat.correctRate < 0.6 ? "text-amber-600" : "text-emerald-600",
                      )}>
                        {Math.round(stat.correctRate * 100)}%
                      </div>
                      <div className="text-[10px] text-ink-400">{stat.answerCount} 人作答</div>
                    </div>
                  </div>
                  {stat.question.remark && (
                    <div className="mt-2 pt-2 border-t border-ink-100 text-xs text-ink-500 flex items-start gap-1">
                      <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{stat.question.remark}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* 表现优秀学生 */}
        <Card>
          <CardHeader
            title="表现优秀学生"
            subtitle="正确率 TOP 5"
            action={<Award className="w-4 h-4 text-gold-600" />}
          />
          <div className="space-y-2">
            {topStudents.length === 0 ? (
              <div className="text-center py-8 text-sm text-ink-400">暂无答题数据</div>
            ) : (
              topStudents.map((stat, idx) => (
                <div key={stat.student.id} className="flex items-center gap-3 p-2.5 rounded-md hover:bg-mist">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                    idx === 0 ? "bg-gold-400 text-ink-900" : "bg-ink-100 text-ink-600",
                  )}>
                    {stat.student.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-900">{stat.student.name}</div>
                    <div className="text-xs text-ink-500">{stat.student.studentNo} · 作答 {stat.answerCount} 题</div>
                  </div>
                  <div className="font-mono text-sm font-semibold text-emerald-600">
                    {Math.round(stat.correctRate * 100)}%
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* 需要关注的学生 */}
        <Card>
          <CardHeader
            title="需要关注的学生"
            subtitle="正确率较低"
            action={<Users className="w-4 h-4 text-red-500" />}
          />
          <div className="space-y-2">
            {weakStudents.length === 0 ? (
              <div className="text-center py-8 text-sm text-ink-400">暂无数据</div>
            ) : (
              weakStudents.map((stat) => (
                <div key={stat.student.id} className="flex items-center gap-3 p-2.5 rounded-md hover:bg-mist">
                  <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {stat.student.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-900">{stat.student.name}</div>
                    <div className="text-xs text-ink-500">{stat.student.studentNo} · 作答 {stat.answerCount} 题</div>
                  </div>
                  <div className={cn(
                    "font-mono text-sm font-semibold",
                    stat.correctRate < 0.4 ? "text-red-600" : "text-amber-600",
                  )}>
                    {Math.round(stat.correctRate * 100)}%
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { FileSpreadsheet, Printer, Layout } from "lucide-react";
import { examPaperService } from "@/services/examPaper";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import type { ExamPaper, ExamPaperQuestion } from "@/types";
import { cn } from "@/lib/utils";

type PaperSize = "A4" | "A3" | "8K";

type SheetMode = "blank" | "with-questions";

const paperSizeConfig: Record<PaperSize, { width: string; height: string; label: string }> = {
  A4: { width: "210mm", height: "297mm", label: "A4" },
  A3: { width: "297mm", height: "420mm", label: "A3" },
  "8K": { width: "260mm", height: "370mm", label: "8K" },
};

const typeLabels: Record<string, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  short: "填空题",
  essay: "解答题",
};

const typeOrder = ["single", "multiple", "judge", "short", "essay"];

interface QuestionGroup {
  type: string;
  label: string;
  questions: { pq: ExamPaperQuestion; index: number }[];
}

const groupByType = (questions: ExamPaperQuestion[], order?: string[]): QuestionGroup[] => {
  const groups: Record<string, QuestionGroup> = {};
  const effectiveOrder = order || typeOrder;
  questions.forEach((pq, idx) => {
    if (!groups[pq.type]) {
      groups[pq.type] = { type: pq.type, label: typeLabels[pq.type] || pq.type, questions: [] };
    }
    groups[pq.type].questions.push({ pq, index: idx });
  });
  return effectiveOrder.filter((t) => groups[t]).map((t) => groups[t]);
};

// 生成学号涂填框（5行10列）
function StudentIdGrid() {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} className="flex gap-0.5">
          {Array.from({ length: 10 }).map((_, col) => (
            <div
              key={col}
              className="w-3.5 h-3.5 border border-ink-900 flex items-center justify-center text-[8px] text-ink-400 font-mono"
            >
              [{col}]
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// 选择题答题框
function ChoiceAnswerBox({ questionIndex, optionsCount }: { questionIndex: number; optionsCount: number }) {
  const options = Array.from({ length: Math.min(optionsCount, 8) }, (_, i) => String.fromCharCode(65 + i));
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-mono font-bold text-ink-700 w-6">{questionIndex}.</span>
      <div className="flex gap-0.5">
        {options.map((opt) => (
          <div
            key={opt}
            className="w-4 h-4 border border-ink-900 flex items-center justify-center text-[9px] font-mono text-ink-500"
          >
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
}

// 填空题答题框
function ShortAnswerBox({ questionIndex, lines = 1 }: { questionIndex: number; lines?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-bold text-ink-700 w-6">{questionIndex}.</span>
        <div className="flex-1 border-b-2 border-ink-900 min-h-[16px]" />
        <div className="w-4 h-4 border border-ink-900 flex items-center justify-center text-[9px] text-ink-500">0</div>
      </div>
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 pl-7">
          <div className="flex-1 border-b-2 border-ink-900 min-h-[16px]" />
        </div>
      ))}
    </div>
  );
}

// 解答题答题框
function EssayAnswerBox({ questionIndex }: { questionIndex: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-bold text-ink-700 w-6">{questionIndex}.</span>
        <div className="flex-1 border-b-2 border-ink-900" />
        <div className="w-4 h-4 border border-ink-900 flex items-center justify-center text-[9px] text-ink-500">0</div>
      </div>
      <div className="pl-7 grid grid-cols-12 gap-px">
        {Array.from({ length: 12 }).map((_, col) => (
          <div key={col} className="flex flex-col gap-px">
            {Array.from({ length: 18 }).map((_, row) => (
              <div key={row} className="border border-dashed border-ink-300 min-h-[18px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// 判断题答题框
function JudgeAnswerBox({ questionIndex }: { questionIndex: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-mono font-bold text-ink-700 w-6">{questionIndex}.</span>
      <div className="flex gap-0.5">
        <div className="w-4 h-4 border border-ink-900 flex items-center justify-center text-[9px] font-mono text-ink-500">√</div>
        <div className="w-4 h-4 border border-ink-900 flex items-center justify-center text-[9px] font-mono text-ink-500">×</div>
      </div>
    </div>
  );
}

// 答题卡主体
function AnswerSheetContent({
  paper,
  questions,
  mode,
  size,
}: {
  paper: ExamPaper;
  questions: ExamPaperQuestion[];
  mode: SheetMode;
  size: PaperSize;
}) {
  const config = paperSizeConfig[size];
  const groups = groupByType(questions);

  return (
    <div
      className="mx-auto bg-white shadow-xl"
      style={{ width: config.width, height: config.height }}
    >
      <div className="p-6 h-full flex flex-col">
        {/* 标题区 */}
        <div className="text-center mb-4 pb-2 border-b-2 border-ink-900">
          <h1 className="font-serif text-xl font-bold text-ink-900">{paper.title}</h1>
          <div className="text-xs text-ink-500 mt-1">
            {paper.grade} · {paper.schoolYear} · {paper.duration}分钟
          </div>
        </div>

        {/* 学生信息区 + 学号涂填区 + 二维码区 */}
        <div className="flex items-start gap-4 mb-4">
          {/* 学生信息 */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink-700 w-12">姓名:</span>
              <div className="flex-1 border-b-2 border-ink-900" />
              <span className="text-sm font-medium text-ink-700 w-12">班级:</span>
              <div className="flex-1 border-b-2 border-ink-900" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink-700 w-12">学号:</span>
              <div className="flex-1 border-b-2 border-ink-900" />
            </div>
          </div>

          {/* 学号涂填 */}
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-ink-700 writing-mode-vertical-rl h-16">学号</span>
            <StudentIdGrid />
          </div>

          {/* 二维码 */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-2 border-ink-900 flex items-center justify-center">
              <div className="text-[8px] text-ink-400 text-center">二维码</div>
            </div>
            <div className="text-[9px] text-ink-500 mt-1 font-mono">ID:{paper.id.slice(-8)}</div>
          </div>
        </div>

        {/* 答题区 */}
        <div className="flex-1 space-y-4 overflow-hidden">
          {groups.map((group) => (
            <div key={group.type}>
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-ink-700">
                <span className="text-sm font-bold text-ink-900">{group.label}</span>
                <span className="text-xs text-ink-500">共{group.questions.length}题</span>
              </div>
              <div className="space-y-1">
                {group.questions.map((item) => {
                  const qType = item.pq.type;
                  if (qType === "single" || qType === "multiple") {
                    return (
                      <div key={item.pq.id}>
                        {mode === "with-questions" && (
                          <div className="text-xs text-ink-600 pl-7 mb-1 line-clamp-2">
                            {item.pq.stem}
                          </div>
                        )}
                        <ChoiceAnswerBox
                          questionIndex={item.index + 1}
                          optionsCount={item.pq.options?.length || 4}
                        />
                      </div>
                    );
                  }
                  if (qType === "judge") {
                    return (
                      <div key={item.pq.id}>
                        {mode === "with-questions" && (
                          <div className="text-xs text-ink-600 pl-7 mb-1 line-clamp-2">
                            {item.pq.stem}
                          </div>
                        )}
                        <JudgeAnswerBox questionIndex={item.index + 1} />
                      </div>
                    );
                  }
                  if (qType === "short") {
                    return (
                      <div key={item.pq.id}>
                        {mode === "with-questions" && (
                          <div className="text-xs text-ink-600 pl-7 mb-1 line-clamp-2">
                            {item.pq.stem}
                          </div>
                        )}
                        <ShortAnswerBox questionIndex={item.index + 1} lines={2} />
                      </div>
                    );
                  }
                  if (qType === "essay") {
                    return <EssayAnswerBox key={item.pq.id} questionIndex={item.index + 1} />;
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 底部信息 */}
        <div className="mt-4 pt-2 border-t border-ink-300 text-center">
          <div className="text-[10px] text-ink-400">总分：______分</div>
        </div>
      </div>
    </div>
  );
}

export default function ExamPaperAnswerSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [loading, setLoading] = useState(true);

  const [size, setSize] = useState<PaperSize>(
    (searchParams.get("size") as PaperSize) || "A4",
  );
  const [mode, setMode] = useState<SheetMode>(
    (searchParams.get("mode") as SheetMode) || "blank",
  );

  useEffect(() => {
    if (!id) return;
    examPaperService.getPaper(id).then((p) => {
      if (!p) {
        toast.error("试卷不存在");
        navigate("/my-resources/exam-papers");
        return;
      }
      setPaper(p);
      setLoading(false);
    });
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  if (!paper) return null;

  return (
    <div className="bg-ink-100 min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="答题卡制作"
          description={paper.title}
          icon={<FileSpreadsheet className="w-5 h-5" />}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(`/exam-papers/${id}`)}>
                返回编辑
              </Button>
              <Button variant="gold" onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
                打印答题卡
              </Button>
            </div>
          }
        />

        {/* 设置面板 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-center gap-6">
            {/* 答题卡模式 */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-ink-700">答题卡模式：</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sheet-mode"
                    value="blank"
                    checked={mode === "blank"}
                    onChange={(e) => setMode(e.target.value as SheetMode)}
                    className="w-3.5 h-3.5 text-gold-600"
                  />
                  <span className="text-sm text-ink-600">空白卡</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sheet-mode"
                    value="with-questions"
                    checked={mode === "with-questions"}
                    onChange={(e) => setMode(e.target.value as SheetMode)}
                    className="w-3.5 h-3.5 text-gold-600"
                  />
                  <span className="text-sm text-ink-600">带题目</span>
                </label>
              </div>
            </div>

            {/* 页面尺寸 */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-ink-700">页面尺寸：</span>
              <Select
                value={size}
                onChange={(e) => setSize(e.target.value as PaperSize)}
                options={[
                  { value: "A4", label: "A4" },
                  { value: "8K", label: "8K" },
                  { value: "A3", label: "A3" },
                ]}
              />
            </div>

            {/* 统计信息 */}
            <div className="flex items-center gap-4 ml-auto">
              <Badge variant="ink">
                共{paper.questions.length}题
              </Badge>
              <Badge variant="gold">
                总分{paper.totalScore}分
              </Badge>
            </div>
          </div>
        </Card>

        {/* 答题卡预览 */}
        <div className="flex justify-center">
          <AnswerSheetContent
            paper={paper}
            questions={paper.questions}
            mode={mode}
            size={size}
          />
        </div>

        {/* 操作提示 */}
        <Card className="mt-6 p-4 text-center">
          <p className="text-sm text-ink-500">
            使用浏览器打印功能（Ctrl+P）打印答题卡，建议选择"实际尺寸"并勾选"背景图形"
          </p>
        </Card>
      </div>
    </div>
  );
}
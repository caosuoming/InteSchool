import { useEffect, useRef } from "react";
import type { RankTrendPoint, SubjectTrend } from "./student-score-trends";

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A horizontally scrollable score or ranking timeline; newest exams are initially in view. */
export function RankTrendStrip({ points, label, large = false, metric = "rank" }: {
  points: RankTrendPoint[];
  label: string;
  large?: boolean;
  metric?: "score" | "rank";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const examIds = points.map((point) => point.examId).join("|");
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [examIds]);

  if (points.length === 0) return <div className="py-4 text-xs text-ink-400">暂无可显示的历次考试成绩</div>;
  const step = large ? 106 : 72;
  const width = Math.max(large ? 420 : 220, points.length * step + 24);
  const top = large ? 32 : 23;
  const bottom = large ? 156 : 76;
  const height = large ? 206 : 119;
  const values = metric === "score" ? points.map((point) => point.value) : points.map((point) => point.rank).filter((rank): rank is number => rank !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (value: number) => top + (max === min ? 0.5 : metric === "score" ? (max - value) / (max - min) : (value - min) / (max - min)) * (bottom - top);
  const x = (index: number) => 12 + step * index + step / 2;
  const segments: string[][] = [];
  let segment: string[] = [];
  let currentRankLabel: string | null = null;
  points.forEach((point, index) => {
    if ((metric === "rank" && point.rank === null) || (metric === "rank" && currentRankLabel !== null && currentRankLabel !== point.rankLabel)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (metric === "score" || point.rank !== null) segment.push(`${x(index)},${y(metric === "score" ? point.value : point.rank!)}`);
    currentRankLabel = point.rank === null ? null : point.rankLabel;
  });
  if (segment.length) segments.push(segment);

  return (
    <div ref={scrollRef} className="max-w-full overflow-x-auto pb-1" data-testid="rank-trend-scroll" aria-label={label}>
      <svg role="img" aria-label={`${label}折线图（${metric === "score" ? "成绩越高位置越高" : "名次越小位置越高"}）`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        {segments.map((coordinates, index) => (
          <polyline key={index} fill="none" stroke="#af8731" strokeWidth={large ? 2.5 : 2} strokeLinejoin="round" points={coordinates.join(" ")} />
        ))}
        {points.map((point, index) => {
          const center = x(index);
          const posY = metric === "score" ? y(point.value) : point.rank === null ? (top + bottom) / 2 : y(point.rank);
          const tooltip = `${point.examName} · ${point.date}\n${point.valueLabel}：${formatScore(point.value)}\n${point.rankLabel}：${point.rank ?? "暂无"}${point.comparisonCount ? ` / ${point.comparisonCount} 个班级` : ""}`;
          return (
            <g key={point.examId}>
              <title>{tooltip}</title>
              <circle cx={center} cy={posY} r={large ? 5 : 4} fill={point.rank === null ? "#9ca3af" : "#af8731"} tabIndex={0} aria-label={tooltip}>
                <title>{tooltip}</title>
              </circle>
              <text x={center} y={Math.max(12, posY - 9)} textAnchor="middle" fontSize={large ? 12 : 10} fill="currentColor" className="text-ink-800 font-semibold">{formatScore(point.value)}</text>
              <text x={center} y={height - (large ? 24 : 15)} textAnchor="middle" fontSize={large ? 12 : 10} fill="currentColor" className="text-ink-500">{point.examName.length > (large ? 8 : 5) ? `${point.examName.slice(0, large ? 7 : 4)}…` : point.examName}</text>
              <text x={center} y={height - 3} textAnchor="middle" fontSize={10} fill="currentColor" className="text-ink-400">{point.rank === null ? "—" : `第${point.rank}名`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** One ranking chart per additional accessible subject, with scores annotated at each exam. */
export function OtherSubjectRankTrends({ trends, studentName }: { trends: SubjectTrend[]; studentName: string }) {
  if (trends.length === 0) return <div className="py-10 text-center text-sm text-ink-400">暂无可查看的其他学科成绩</div>;
  return (
    <div className="space-y-5">
      {trends.map(({ subject, points }) => (
        <section key={subject} className="rounded-lg border border-ink-100 bg-mist/40 p-4">
          <h4 className="mb-3 text-sm font-semibold text-ink-800">{subject} · 历次成绩与名次</h4>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1 text-xs text-ink-500">成绩走势</div>
              <RankTrendStrip points={points} label={`${studentName}${subject}成绩走势`} metric="score" large />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-xs text-ink-500">名次走势</div>
              <RankTrendStrip points={points} label={`${studentName}${subject}名次走势`} large />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

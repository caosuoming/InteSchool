import { useEffect, useRef } from "react";
import type { RankTrendPoint, ScoreHistoryExam } from "./student-score-trends";

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A horizontally scrollable ranking timeline; most recent exams are initially in view. */
export function RankTrendStrip({ points, label, large = false }: {
  points: RankTrendPoint[];
  label: string;
  large?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const examIds = points.map((point) => point.examId).join("|");
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [examIds]);

  if (points.length === 0) return <div className="py-4 text-xs text-ink-400">暂无可比较的历次考试名次</div>;
  const step = large ? 106 : 72;
  const width = Math.max(large ? 420 : 220, points.length * step + 24);
  const top = large ? 32 : 23;
  const bottom = large ? 156 : 76;
  const height = large ? 206 : 119;
  const ranks = points.map((point) => point.rank).filter((rank): rank is number => rank !== null);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const y = (rank: number) => top + (max === min ? 0.5 : (rank - min) / (max - min)) * (bottom - top);
  const x = (index: number) => 12 + step * index + step / 2;
  const segments: string[][] = [];
  let segment: string[] = [];
  let currentRankLabel: string | null = null;
  points.forEach((point, index) => {
    if (point.rank === null || (currentRankLabel !== null && currentRankLabel !== point.rankLabel)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (point.rank !== null) segment.push(`${x(index)},${y(point.rank)}`);
    currentRankLabel = point.rank === null ? null : point.rankLabel;
  });
  if (segment.length) segments.push(segment);

  return (
    <div ref={scrollRef} className="max-w-full overflow-x-auto pb-1" data-testid="rank-trend-scroll" aria-label={label}>
      <svg role="img" aria-label={`${label}折线图（名次越小位置越高）`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        {segments.map((coordinates, index) => (
          <polyline key={index} fill="none" stroke="#af8731" strokeWidth={large ? 2.5 : 2} strokeLinejoin="round" points={coordinates.join(" ")} />
        ))}
        {points.map((point, index) => {
          const center = x(index);
          const posY = point.rank === null ? (top + bottom) / 2 : y(point.rank);
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

const lineColors = ["#b08b39", "#0f766e", "#2563eb", "#b45309", "#9333ea", "#be123c", "#0e7490", "#4d7c0f", "#64748b", "#7c3aed"];

export function AllSubjectScoreChart({ exams, subjects }: { exams: ScoreHistoryExam[]; subjects: string[] }) {
  if (exams.length === 0 || subjects.length === 0) return <div className="py-10 text-center text-sm text-ink-400">暂无可显示的历史成绩</div>;
  const step = 100;
  const width = Math.max(620, exams.length * step + 80);
  const height = 295;
  const x = (index: number) => 42 + step * index + step / 2;
  const allScores = exams.flatMap((exam) => Object.values(exam.scores));
  const low = Math.max(0, Math.min(...allScores) - 10);
  const high = Math.max(...allScores) + 10;
  const y = (value: number) => 22 + (1 - (value - low) / (high - low)) * 205;

  return (
    <div>
      <div className="flex flex-wrap gap-3 pb-3 text-xs text-ink-600" aria-label="学科图例">
        {subjects.map((subject, index) => (
          <span key={subject} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ backgroundColor: lineColors[index % lineColors.length] }} />{subject}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto pb-2" data-testid="all-subjects-scroll">
        <svg role="img" aria-label="历次考试各学科成绩折线图" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
          {[0, 1, 2, 3, 4].map((index) => {
            const lineY = 22 + index * 205 / 4;
            return (
              <g key={index}>
                <line x1={35} y1={lineY} x2={width - 15} y2={lineY} stroke="#e5e7eb" strokeDasharray="3 4" />
                <text x={30} y={lineY + 4} textAnchor="end" fontSize={11} fill="#888">{formatScore(high - (high - low) * index / 4)}</text>
              </g>
            );
          })}
          {subjects.map((subject, subjectIndex) => {
            const color = lineColors[subjectIndex % lineColors.length];
            const coordinates = exams.map((exam, index) => exam.scores[subject] === undefined ? null : `${x(index)},${y(exam.scores[subject])}`);
            const chunks: string[][] = [];
            let chunk: string[] = [];
            coordinates.forEach((value) => {
              if (!value) {
                if (chunk.length) chunks.push(chunk);
                chunk = [];
              } else chunk.push(value);
            });
            if (chunk.length) chunks.push(chunk);
            return (
              <g key={subject}>
                {chunks.map((points, index) => <polyline key={index} fill="none" stroke={color} strokeWidth={2} points={points.join(" ")} />)}
                {exams.map((exam, index) => exam.scores[subject] === undefined ? null : (
                  <circle key={exam.id} cx={x(index)} cy={y(exam.scores[subject])} r={4} fill={color} tabIndex={0} aria-label={`${exam.name} ${subject} ${formatScore(exam.scores[subject])}分`}>
                    <title>{`${exam.name} · ${exam.date} · ${subject}：${formatScore(exam.scores[subject])}分`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {exams.map((exam, index) => (
            <g key={exam.id}>
              <text x={x(index)} y={height - 42} textAnchor="middle" fontSize={11} fill="#666">{exam.name.length > 8 ? `${exam.name.slice(0, 7)}…` : exam.name}</text>
              <text x={x(index)} y={height - 24} textAnchor="middle" fontSize={10} fill="#888">{exam.date}</text>
              <text x={x(index)} y={height - 7} textAnchor="middle" fontSize={10} fill="#888">{exam.gradeRank === null ? "" : `总分年级第${exam.gradeRank}名`}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

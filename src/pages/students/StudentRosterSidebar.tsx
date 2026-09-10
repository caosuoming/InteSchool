import {
  ChevronDown,
  ChevronRight,
  Clock,
  GraduationCap,
  Search,
  Star,
} from "lucide-react";
import type { StudentRosterGroup } from "./student-roster";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

export function StudentRosterSidebar({
  groups,
  loading,
  keyword,
  selectedStudentId,
  expandedGroupIds,
  followedStudentIds,
  followPendingStudentIds,
  lastInteractionMap,
  onKeywordChange,
  onToggleGroup,
  onSelectStudent,
  onToggleFollow,
}: {
  groups: StudentRosterGroup[];
  loading: boolean;
  keyword: string;
  selectedStudentId: string | null;
  expandedGroupIds: ReadonlySet<string>;
  followedStudentIds: ReadonlySet<string>;
  followPendingStudentIds: ReadonlySet<string>;
  lastInteractionMap: Readonly<Record<string, string>>;
  onKeywordChange: (value: string) => void;
  onToggleGroup: (groupId: string) => void;
  onSelectStudent: (studentId: string) => void;
  onToggleFollow: (studentId: string) => void;
}) {
  return (
    <Card className="h-full flex flex-col lg:h-auto lg:min-h-[calc(100vh-12rem)]">
      <div className="p-3 border-b border-ink-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            type="text"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索学生..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-ink-200 bg-paper text-sm focus:outline-none focus:border-gold-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto lg:overflow-visible">
        {loading ? (
          <div className="p-6 text-center text-xs text-ink-400">
            <div className="inline-block w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mb-2" />
            <div>加载中...</div>
          </div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink-400">暂无学生</div>
        ) : (
          <div className="px-3 py-2 space-y-3">
            {groups.map((group) => {
              const expanded = expandedGroupIds.has(group.id);
              const groupContentId = `student-group-${group.id}`;
              return (
                <section key={group.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={groupContentId}
                    onClick={() => onToggleGroup(group.id)}
                    className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-semibold text-gold-700 tracking-wide transition-colors hover:bg-gold-400/10"
                  >
                    {expanded
                      ? <ChevronDown className="w-3 h-3 flex-shrink-0" />
                      : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                    <GraduationCap className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{group.name}</span>
                    <span className="text-ink-400 font-normal">（{group.students.length}）</span>
                  </button>
                  {expanded && (
                    <div id={groupContentId} className="mt-1 space-y-0.5">
                      {group.students.map((student) => {
                        const selected = selectedStudentId === student.id;
                        const followed = followedStudentIds.has(student.id);
                        return (
                          <div
                            key={`${group.id}-${student.id}`}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
                              selected ? "bg-gold-50 ring-1 ring-gold-300" : "hover:bg-mist",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => onSelectStudent(student.id)}
                              aria-label={student.name}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                                selected ? "bg-gold-200 text-gold-800" : "bg-mist text-ink-600",
                              )}>
                                {student.name.slice(0, 1)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-ink-900 truncate">{student.name}</span>
                                </div>
                                <div className="text-[10px] text-ink-400 flex items-center gap-1">
                                  {lastInteractionMap[student.id] ? (
                                    <>
                                      <Clock className="w-2.5 h-2.5" />
                                      {timeAgo(lastInteractionMap[student.id])}
                                    </>
                                  ) : (
                                    <span className="text-amber-500">未互动</span>
                                  )}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleFollow(student.id)}
                              disabled={followPendingStudentIds.has(student.id)}
                              aria-label={followed ? `取消关注${student.name}` : `关注${student.name}`}
                              title={followed ? "取消关注" : "关注"}
                              className={cn(
                                "flex-shrink-0 rounded p-1 transition-colors disabled:opacity-50",
                                followed ? "text-gold-600" : "text-ink-300 hover:text-gold-500",
                              )}
                            >
                              <Star className={cn("h-4 w-4", followed && "fill-current")} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

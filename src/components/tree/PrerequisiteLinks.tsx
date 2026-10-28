import type { Chapter, KnowledgePoint, NodePrerequisite } from "@/types";

import { prerequisiteName } from "./prerequisite-name";

export function PrerequisiteLinks({
  references,
  chapters,
  points,
  onNavigate,
  onRemove,
  masteryLevels,
}: {
  references: NodePrerequisite[];
  chapters: Chapter[];
  points: KnowledgePoint[];
  onNavigate: (reference: NodePrerequisite) => void;
  onRemove?: (reference: NodePrerequisite) => void;
  masteryLevels?: Readonly<Record<string, string>>;
}) {
  const resolved = references.flatMap((reference) => {
    const name = prerequisiteName(reference, chapters, points);
    return name ? [{ reference, name }] : [];
  });
  if (resolved.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="前置节点">
      {resolved.map(({ reference, name }) => {
        const label = reference.type === "chapter" ? "前置章节课" : "前置知识点";
        const key = reference.type + ":" + reference.id;
        return (
          <div key={key} className="inline-flex items-center gap-1 text-xs">
            <span className="w-5 border-t border-dashed border-ink-300" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onNavigate(reference)}
              className="rounded border border-dashed border-ink-200 bg-ink-50/40 px-2 py-1 text-ink-600 hover:border-gold-400 hover:text-gold-700"
              aria-label={label + " " + name}
              title="点击连接到该节点"
            >
              {label}：{name}
              {masteryLevels?.[key] && (
                <span className="ml-1 font-medium">· {masteryLevels[key]}</span>
              )}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(reference)}
                className="px-1 text-ink-400 hover:text-red-600"
                aria-label={"移除" + label + " " + name}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

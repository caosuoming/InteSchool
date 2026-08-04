import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pin,
  PinOff,
  Settings2,
  X,
} from "lucide-react";
import { useActionPrefs, type ActionPrefs } from "@/hooks/useActionPrefs";
import { cn } from "@/lib/utils";

export type ResourceActionTone = "default" | "gold" | "teal" | "amber" | "violet" | "indigo" | "danger";

export interface ConfigurableResourceAction {
  key: string;
  label: string;
  ariaLabel?: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: ResourceActionTone;
}

interface ConfigurableResourceActionsProps {
  actions: ConfigurableResourceAction[];
  compact?: boolean;
}

const DOCUMENT_ACTION_PREFS: ActionPrefs = {
  order: [
    "view",
    "rename",
    "addToLesson",
    "answerSheet",
    "convertToLecture",
    "convertToExamPaper",
    "share",
    "addToPrep",
    "explanationVideo",
    "duplicate",
    "delete",
    "preview",
  ],
  collapsed: [
    "answerSheet",
    "convertToLecture",
    "convertToExamPaper",
    "share",
    "addToPrep",
    "explanationVideo",
    "duplicate",
    "delete",
    "preview",
  ],
};

const toneClasses: Record<ResourceActionTone, string> = {
  default: "text-ink-400 hover:bg-mist hover:text-ink-700",
  gold: "text-ink-400 hover:bg-gold-50 hover:text-gold-700",
  teal: "text-ink-400 hover:bg-teal-50 hover:text-teal-700",
  amber: "text-ink-400 hover:bg-amber-50 hover:text-amber-700",
  violet: "text-ink-400 hover:bg-violet-50 hover:text-violet-700",
  indigo: "text-ink-400 hover:bg-indigo-50 hover:text-indigo-700",
  danger: "text-ink-400 hover:bg-red-50 hover:text-red-600",
};

function actionOrder(action: ConfigurableResourceAction, order: string[]) {
  const index = order.indexOf(action.key);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function ConfigurableResourceActions({ actions, compact }: ConfigurableResourceActionsProps) {
  const { prefs, update, collapse, expand } = useActionPrefs({
    storageKey: "document-resource-action-prefs",
    defaultPrefs: DOCUMENT_ACTION_PREFS,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setCustomizeOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setCustomizeOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const orderedActions = useMemo(() => [...actions].sort((left, right) => {
    const orderDifference = actionOrder(left, prefs.order) - actionOrder(right, prefs.order);
    return orderDifference || actions.indexOf(left) - actions.indexOf(right);
  }), [actions, prefs.order]);
  const directActions = orderedActions.filter((action) => !prefs.collapsed.includes(action.key));
  const menuActions = orderedActions.filter((action) => prefs.collapsed.includes(action.key));
  const padding = compact ? "p-1" : "p-1.5";
  const iconSize = compact ? "[&_svg]:h-3.5 [&_svg]:w-3.5" : "[&_svg]:h-4 [&_svg]:w-4";

  const runAction = (event: React.MouseEvent, action: ConfigurableResourceAction) => {
    event.stopPropagation();
    if (action.disabled) return;
    action.onClick();
  };

  const moveAction = (key: string, direction: "up" | "down") => {
    const index = orderedActions.findIndex((action) => action.key === key);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedActions.length) return;

    const currentKey = orderedActions[index].key;
    const targetKey = orderedActions[targetIndex].key;
    const order = [...prefs.order];
    const currentOrderIndex = order.indexOf(currentKey);
    const targetOrderIndex = order.indexOf(targetKey);
    if (currentOrderIndex < 0 || targetOrderIndex < 0) return;
    [order[currentOrderIndex], order[targetOrderIndex]] = [order[targetOrderIndex], order[currentOrderIndex]];
    update({ ...prefs, order });
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-0.5" data-testid="configurable-resource-actions">
      {directActions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={(event) => runAction(event, action)}
          disabled={action.disabled}
          className={cn(
            padding,
            iconSize,
            "rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            toneClasses[action.tone ?? "default"],
          )}
          title={action.label}
          aria-label={action.ariaLabel ?? action.label}
        >
          {action.icon}
        </button>
      ))}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
          setCustomizeOpen(false);
        }}
        className={cn(
          padding,
          iconSize,
          "rounded text-ink-400 transition-colors hover:bg-mist hover:text-ink-700",
          menuOpen && "bg-mist text-ink-700",
        )}
        title="更多操作"
        aria-label="更多操作"
        aria-expanded={menuOpen}
      >
        <MoreHorizontal />
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="文档操作"
          className="absolute right-0 top-full z-40 mt-1 min-w-52 rounded-lg border border-ink-100 bg-paper py-1 shadow-lg animate-fade-in"
        >
          {menuActions.length > 0 ? menuActions.map((action) => (
            <div key={action.key} className="group flex items-center">
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  runAction(event, action);
                  if (!action.disabled) setMenuOpen(false);
                }}
                disabled={action.disabled}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  action.tone === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-ink-600 hover:bg-mist",
                  "[&_svg]:h-3.5 [&_svg]:w-3.5",
                )}
                aria-label={action.ariaLabel ?? action.label}
              >
                {action.icon}
                <span className="truncate">{action.label}</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  expand(action.key);
                }}
                className="mr-1 rounded p-1 text-ink-300 opacity-0 transition-all hover:bg-gold-50 hover:text-gold-700 group-hover:opacity-100 focus:opacity-100"
                title={`直接显示：${action.label}`}
                aria-label={`直接显示：${action.label}`}
              >
                <PinOff className="h-3 w-3" />
              </button>
            </div>
          )) : (
            <div className="px-3 py-2 text-xs text-ink-400">所有操作均已直接显示</div>
          )}
          <div className="mt-1 border-t border-ink-50 pt-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                setCustomizeOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gold-700 transition-colors hover:bg-gold-50 [&_svg]:h-3.5 [&_svg]:w-3.5"
            >
              <Settings2 />
              自定义按钮与顺序
            </button>
          </div>
        </div>
      )}

      {customizeOpen && (
        <div
          role="dialog"
          aria-label="自定义文档操作"
          className="absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border border-ink-100 bg-paper py-2 shadow-lg animate-fade-in"
        >
          <div className="flex items-start justify-between border-b border-ink-50 px-3 pb-2">
            <div>
              <div className="text-xs font-medium text-ink-700">自定义按钮与顺序</div>
              <div className="mt-0.5 text-[11px] text-ink-400">图钉控制直接显示，箭头调整先后顺序</div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setCustomizeOpen(false);
              }}
              className="rounded p-1 text-ink-300 hover:bg-mist hover:text-ink-700"
              aria-label="关闭自定义操作"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {orderedActions.map((action, index) => {
              const isCollapsed = prefs.collapsed.includes(action.key);
              return (
                <div key={action.key} className="group flex items-center px-2 py-1.5 hover:bg-mist/50">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveAction(action.key, "up");
                      }}
                      disabled={index === 0}
                      className="rounded p-0.5 text-ink-300 hover:text-gold-700 disabled:cursor-not-allowed disabled:opacity-25"
                      title="前移"
                      aria-label={`前移：${action.label}`}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveAction(action.key, "down");
                      }}
                      disabled={index === orderedActions.length - 1}
                      className="rounded p-0.5 text-ink-300 hover:text-gold-700 disabled:cursor-not-allowed disabled:opacity-25"
                      title="后移"
                      aria-label={`后移：${action.label}`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="ml-1.5 flex min-w-0 flex-1 items-center gap-1.5 text-xs text-ink-700 [&_svg]:h-3.5 [&_svg]:w-3.5">
                    {action.icon}
                    <span className="truncate">{action.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isCollapsed) expand(action.key);
                      else collapse(action.key);
                    }}
                    className={cn(
                      "ml-1 rounded p-1 transition-colors",
                      isCollapsed
                        ? "text-ink-400 hover:bg-mist hover:text-gold-700"
                        : "text-gold-700 hover:bg-gold-50",
                    )}
                    title={isCollapsed ? "直接显示" : "移入更多菜单"}
                    aria-label={`${isCollapsed ? "直接显示" : "移入更多菜单"}：${action.label}`}
                  >
                    {isCollapsed ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

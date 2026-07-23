import { useState, useRef, useEffect } from "react";
import {
  MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight,
  Pin, PinOff, Settings2,
} from "lucide-react";
import { AddToBasketDropdown } from "@/components/basket/AddToBasketDropdown";
import { cn } from "@/lib/utils";
import { useActionPrefs } from "@/hooks/useActionPrefs";
import type { Question } from "@/types";

export interface QuestionAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  variant?: "ghost" | "gold" | "outline" | "danger";
  onClick: () => void;
  /** 是否可见（由父组件控制，如管理模式/使用模式） */
  visible: boolean;
}

interface QuestionActionsBarProps {
  question: Question;
  actions: Omit<QuestionAction, "visible">[];
  onShowSettings?: () => void;
}

const variantClasses = {
  ghost: "text-ink-500 hover:bg-mist hover:text-ink-700",
  gold: "text-gold-600 hover:bg-gold-50",
  outline: "text-ink-600 border border-ink-200 hover:border-gold-300 hover:text-gold-600",
  danger: "text-red-500 hover:bg-red-50 hover:text-red-600",
};

export function QuestionActionsBar({ question, actions }: QuestionActionsBarProps) {
  const { prefs, collapse, expand, move } = useActionPrefs();
  const [moreOpen, setMoreOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const customizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setCustomizeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 按用户的 order 排序
  const orderedActions = [...actions].sort((a, b) => {
    const ai = prefs.order.indexOf(a.key);
    const bi = prefs.order.indexOf(b.key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const visibleActions = orderedActions.filter((a) => !prefs.collapsed.includes(a.key));
  const collapsedActions = orderedActions.filter((a) => prefs.collapsed.includes(a.key));

  return (
    <div className="flex items-center gap-1.5 flex-wrap relative">
      {/* 并排显示的按钮 */}
      {visibleActions.map((action) => (
        <button
          key={action.key}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          className={cn(
            "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
            variantClasses[action.variant || "ghost"],
          )}
          title={action.label}
        >
          {action.icon}
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      ))}

      {/* 折叠的按钮 */}
      {collapsedActions.length > 0 && (
        <div ref={moreRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMoreOpen(!moreOpen);
              setCustomizeOpen(false);
            }}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md text-ink-500 hover:bg-mist hover:text-ink-700 transition-colors flex items-center gap-1.5"
            title="更多操作"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">更多</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen && (
            <div className="absolute left-0 top-full mt-1 w-52 bg-paper border border-ink-100 rounded-lg shadow-lg z-30 py-1 animate-fade-in">
              {collapsedActions.map((action) => (
                <div key={action.key} className="flex items-center group">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick();
                      setMoreOpen(false);
                    }}
                    className={cn(
                      "flex-1 text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-mist transition-colors",
                      action.variant === "danger" ? "text-red-600" : "text-ink-600",
                    )}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      expand(action.key);
                    }}
                    className="p-1 mr-1 text-ink-300 hover:text-gold-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移出折叠"
                  >
                    <PinOff className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="border-t border-ink-50 mt-1 pt-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomizeOpen(true);
                    setMoreOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-gold-600 hover:bg-gold-50 transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  自定义按钮
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 自定义按钮（当没有折叠项时也可访问） */}
      {!moreOpen && (
        <div ref={customizeRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCustomizeOpen(!customizeOpen);
            }}
            className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
            title="自定义按钮"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          {customizeOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-paper border border-ink-100 rounded-lg shadow-lg z-30 py-2 animate-fade-in">
              <div className="px-3 pb-2 border-b border-ink-50">
                <div className="text-xs font-medium text-ink-700">自定义按钮显示</div>
                <div className="text-[11px] text-ink-400 mt-0.5">
                  拖动箭头调整顺序，点击图钉折叠/展开
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {orderedActions.map((action) => {
                  const isCollapsed = prefs.collapsed.includes(action.key);
                  const idx = prefs.order.indexOf(action.key);
                  return (
                    <div
                      key={action.key}
                      className="flex items-center px-2 py-1.5 hover:bg-mist/50 transition-colors group"
                    >
                      <div className="flex flex-col">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            move(action.key, "left");
                          }}
                          disabled={idx === 0}
                          className="p-0.5 text-ink-300 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="前移"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            move(action.key, "right");
                          }}
                          disabled={idx === prefs.order.length - 1}
                          className="p-0.5 text-ink-300 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="后移"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="ml-1.5 flex-1 flex items-center gap-1.5 text-xs text-ink-700">
                        {action.icon}
                        {action.label}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCollapsed) {
                            expand(action.key);
                          } else {
                            collapse(action.key);
                          }
                        }}
                        className={cn(
                          "p-1 rounded transition-colors ml-1",
                          isCollapsed
                            ? "text-ink-400 hover:text-gold-600"
                            : "text-gold-600 hover:text-gold-700",
                        )}
                        title={isCollapsed ? "展开显示" : "折叠到更多"}
                      >
                        {isCollapsed ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { AddToBasketDropdown };

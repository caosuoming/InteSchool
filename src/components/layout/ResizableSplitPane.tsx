import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResizableSplitPaneProps {
  storageKey: string;
  sidebar: ReactNode;
  children: ReactNode;
  defaultSidebarWidth?: number;
  minSidebarWidth?: number;
  maxSidebarWidth?: number;
  minContentWidth?: number;
  collapsible?: boolean;
  className?: string;
  sidebarClassName?: string;
  contentClassName?: string;
}

function clampSidebarWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, width));
}

function readStoredWidth(storageKey: string, fallback: number, minWidth: number, maxWidth: number): number {
  try {
    const stored = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(stored)
      ? clampSidebarWidth(stored, minWidth, maxWidth)
      : fallback;
  } catch {
    return fallback;
  }
}

function readStoredCollapsed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(`${storageKey}:collapsed`) === "true";
  } catch {
    return false;
  }
}

export function ResizableSplitPane({
  storageKey,
  sidebar,
  children,
  defaultSidebarWidth = 280,
  minSidebarWidth = 220,
  maxSidebarWidth = 520,
  minContentWidth = 420,
  collapsible = false,
  className,
  sidebarClassName,
  contentClassName,
}: ResizableSplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredWidth(storageKey, defaultSidebarWidth, minSidebarWidth, maxSidebarWidth),
  );
  const [collapsed, setCollapsed] = useState(() => collapsible && readStoredCollapsed(storageKey));
  const [resizing, setResizing] = useState(false);

  const effectiveMaxWidth = useCallback(() => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width;
    if (!containerWidth) return maxSidebarWidth;
    return Math.max(
      minSidebarWidth,
      Math.min(maxSidebarWidth, containerWidth - minContentWidth - 16),
    );
  }, [maxSidebarWidth, minContentWidth, minSidebarWidth]);

  const updateWidth = useCallback((nextWidth: number) => {
    setSidebarWidth(clampSidebarWidth(nextWidth, minSidebarWidth, effectiveMaxWidth()));
  }, [effectiveMaxWidth, minSidebarWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(sidebarWidth));
    } catch {
      // Storage may be unavailable in private browsing or restricted embeds.
    }
  }, [sidebarWidth, storageKey]);

  useEffect(() => {
    if (!collapsible) return;
    try {
      window.localStorage.setItem(`${storageKey}:collapsed`, String(collapsed));
    } catch {
      // Storage may be unavailable in private browsing or restricted embeds.
    }
  }, [collapsed, collapsible, storageKey]);

  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const left = containerRef.current?.getBoundingClientRect().left ?? 0;
      updateWidth(event.clientX - left);
    };
    const stopResizing = () => setResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizing, updateWidth]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = sidebarWidth - 16;
    if (event.key === "ArrowRight") nextWidth = sidebarWidth + 16;
    if (event.key === "Home") nextWidth = minSidebarWidth;
    if (event.key === "End") nextWidth = effectiveMaxWidth();
    if (nextWidth === null) return;
    event.preventDefault();
    updateWidth(nextWidth);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid grid-cols-1 gap-4 lg:gap-0",
        collapsible
          ? collapsed
            ? "lg:grid-cols-[0_2rem_minmax(0,1fr)]"
            : "lg:grid-cols-[var(--sidebar-width)_2rem_minmax(0,1fr)]"
          : "lg:grid-cols-[var(--sidebar-width)_1rem_minmax(0,1fr)]",
        className,
      )}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <div className={cn("min-w-0", collapsed && "lg:hidden", sidebarClassName)}>{sidebar}</div>
      <div className="relative hidden h-full items-stretch justify-center lg:flex">
        {!collapsed && (
          <div
            role="separator"
            aria-label="调整左侧列表宽度"
            aria-orientation="vertical"
            aria-valuemin={minSidebarWidth}
            aria-valuemax={effectiveMaxWidth()}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              setResizing(true);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "group flex h-full flex-1 cursor-col-resize items-stretch justify-center outline-none",
              "focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2",
            )}
          >
            <div
              className={cn(
                "w-px rounded-full bg-ink-200 transition-all group-hover:w-1 group-hover:bg-gold-300",
                resizing && "w-1 bg-gold-400",
              )}
            />
          </div>
        )}
        {collapsible && (
          <button
            type="button"
            aria-label={collapsed ? "展开左侧列表" : "折叠左侧列表"}
            title={collapsed ? "展开左侧列表" : "向左折叠左侧列表"}
            onClick={() => {
              setResizing(false);
              setCollapsed((value) => !value);
            }}
            className="absolute top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-ink-200 bg-paper text-ink-500 shadow-sm transition-colors hover:border-gold-300 hover:text-gold-700"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </div>
  );
}

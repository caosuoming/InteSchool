import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface ResizableSidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsed?: boolean;
  className?: string;
  separatorLabel?: string;
}

interface ResizeState {
  startX: number;
  startWidth: number;
}

function clampWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(minWidth, width));
}

function loadStoredWidth(storageKey: string, fallback: number, minWidth: number, maxWidth: number) {
  if (typeof window === "undefined") return fallback;
  const storedValue = window.localStorage.getItem(storageKey);
  if (storedValue === null) return fallback;
  const stored = Number(storedValue);
  return Number.isFinite(stored) ? clampWidth(stored, minWidth, maxWidth) : fallback;
}

export function ResizableSidebarLayout({
  sidebar,
  children,
  storageKey,
  defaultWidth = 320,
  minWidth = 240,
  maxWidth = 560,
  collapsed = false,
  className,
  separatorLabel = "调整目录宽度",
}: ResizableSidebarLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    loadStoredWidth(storageKey, defaultWidth, minWidth, maxWidth),
  );
  const resizeStateRef = useRef<ResizeState | null>(null);

  const resizeTo = useCallback((nextWidth: number) => {
    setSidebarWidth(clampWidth(nextWidth, minWidth, maxWidth));
  }, [maxWidth, minWidth]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(sidebarWidth));
  }, [sidebarWidth, storageKey]);

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) return;
    resizeTo(resizeState.startWidth + event.clientX - resizeState.startX);
  };

  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeStateRef.current) return;
    resizeStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeTo(sidebarWidth - 16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeTo(sidebarWidth + 16);
    } else if (event.key === "Home") {
      event.preventDefault();
      resizeTo(minWidth);
    } else if (event.key === "End") {
      event.preventDefault();
      resizeTo(maxWidth);
    }
  };

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        !collapsed && "lg:grid-cols-[var(--directory-width)_0.75rem_minmax(0,1fr)] lg:gap-0",
        className,
      )}
      style={{ "--directory-width": `${sidebarWidth}px` } as CSSProperties}
    >
      {!collapsed && <div className="min-w-0">{sidebar}</div>}
      {!collapsed && (
        <div
          role="separator"
          aria-label={separatorLabel}
          aria-orientation="vertical"
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          className="group hidden cursor-col-resize touch-none items-stretch justify-center outline-none lg:flex"
          title="拖动调整宽度；方向键微调"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={handleResizeKey}
        >
          <div className="w-px bg-ink-100 transition-colors group-hover:bg-gold-400 group-focus-visible:bg-gold-500" />
        </div>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default ResizableSidebarLayout;

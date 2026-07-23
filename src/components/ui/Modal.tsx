import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

const sizeClass = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-7xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative bg-paper rounded-xl shadow-2xl border border-ink-100 w-full max-h-[90vh] flex flex-col animate-scale-in",
          sizeClass[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="px-6 py-4 border-b border-ink-100 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title && (
                  <h3 className="font-serif text-lg font-semibold text-ink-900">{title}</h3>
                )}
                {description && (
                  <p className="text-sm text-ink-500 mt-1">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 py-3 border-t border-ink-100 flex items-center justify-end gap-2 flex-shrink-0 bg-mist/40 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;

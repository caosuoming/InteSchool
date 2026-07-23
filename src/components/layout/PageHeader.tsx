import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-ink-900 text-gold-400 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-bold text-ink-900 truncate">{title}</h1>
          {description && <p className="text-sm text-ink-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
    </div>
  );
}

export default PageHeader;

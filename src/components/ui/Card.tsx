import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  children: ReactNode;
}

export function Card({ hoverable = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn("card-base p-5", hoverable && "hover:-translate-y-0.5 cursor-pointer", className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="font-serif text-base font-semibold text-ink-900 truncate">{title}</div>
        {subtitle && <div className="text-xs text-ink-500 mt-0.5">{subtitle}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("text-sm text-ink-700", className)}>{children}</div>;
}

export default Card;

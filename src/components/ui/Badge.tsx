import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "gold" | "ink" | "teal" | "red" | "green" | "amber";

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantClass: Record<Variant, string> = {
  default: "tag-ink",
  gold: "tag-gold",
  ink: "tag-ink",
  teal: "tag-teal",
  red: "tag-red",
  green: "tag-green",
  amber: "tag-base bg-amber-50 text-amber-700 border border-amber-200",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return <span className={cn(variantClass[variant], className)}>{children}</span>;
}

export default Badge;

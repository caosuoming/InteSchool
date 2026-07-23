import { type ReactNode, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "gold" | "ink" | "outline" | "ghost";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  gold: "btn-gold",
  ink: "btn-ink",
  outline: "btn-outline",
  ghost: "btn-ghost",
};

const sizeClass: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-6 py-3",
  icon: "p-2",
};

export function Button({
  variant = "ink",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(variantClass[variant], sizeClass[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

export default Button;

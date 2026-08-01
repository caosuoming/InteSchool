import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BrandMarkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  decorative?: boolean;
}

export function BrandMark({ className, decorative = true, alt, ...props }: BrandMarkProps) {
  return (
    <img
      src="/brand-mark.svg"
      className={cn("block flex-shrink-0", className)}
      alt={decorative ? "" : (alt ?? "智题云校")}
      aria-hidden={decorative || undefined}
      {...props}
    />
  );
}

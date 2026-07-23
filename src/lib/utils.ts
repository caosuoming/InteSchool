import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 根据选择题选项数量返回合理的 Tailwind 网格列数。
 * 规则：默认所有选项均匀分布在一行；一行放不下时降级为 2 列；
 * 仍然放不下（选项过多）时降级为 1 列。窄屏自动使用较少列数。
 */
export function getOptionsGridCols(count: number): string {
  switch (count) {
    case 1: return "grid-cols-1"
    case 2: return "grid-cols-2"
    case 3: return "grid-cols-3"
    case 4: return "grid-cols-2 sm:grid-cols-4"
    case 5: return "grid-cols-2 sm:grid-cols-5"
    case 6: return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
    case 7:
    case 8: return "grid-cols-2 sm:grid-cols-4"
    default: return "grid-cols-1 sm:grid-cols-2"
  }
}

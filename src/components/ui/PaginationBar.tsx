import { cn } from "@/lib/utils";

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions: number[];
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function pageNumbers(currentPage: number, totalPages: number) {
  const pages: (number | "ellipsis")[] = [];
  if (totalPages <= 7) {
    for (let page = 1; page <= totalPages; page += 1) pages.push(page);
    return pages;
  }

  if (currentPage <= 3) {
    for (let page = 1; page <= 5; page += 1) pages.push(page);
    return [...pages, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    pages.push(1, "ellipsis");
    for (let page = totalPages - 4; page <= totalPages; page += 1) pages.push(page);
    return pages;
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ] as const;
}

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-500">
          显示 {startItem}-{endItem} {itemLabel}，共 {totalItems} {itemLabel}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink-400">
          每页
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="cursor-pointer rounded border border-ink-200 bg-paper px-2 py-1 text-xs text-ink-700 outline-none focus:border-gold-400"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          {itemLabel}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            currentPage <= 1
              ? "cursor-not-allowed text-ink-300"
              : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
          )}
        >
          上一页
        </button>

        {pageNumbers(currentPage, totalPages).map((page, index) => (
          <button
            key={`${page}-${index}`}
            type="button"
            onClick={() => typeof page === "number" && onPageChange(page)}
            disabled={page === "ellipsis"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded text-xs transition-colors",
              page === currentPage
                ? "bg-gold-500 font-medium text-white"
                : page === "ellipsis"
                  ? "cursor-default text-ink-400"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            {page === "ellipsis" ? "..." : page}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            currentPage >= totalPages
              ? "cursor-not-allowed text-ink-300"
              : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
          )}
        >
          下一页
        </button>

        <label className="ml-2 flex items-center gap-1 text-xs text-ink-400">
          跳至
          <input
            type="number"
            min={1}
            max={totalPages}
            className="w-10 rounded border border-ink-200 px-1 py-1 text-center text-xs outline-none focus:border-gold-400"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const value = Number(event.currentTarget.value);
              if (value >= 1 && value <= totalPages) onPageChange(value);
            }}
            onBlur={(event) => {
              const value = Number(event.currentTarget.value);
              if (value >= 1 && value <= totalPages) onPageChange(value);
            }}
          />
          页
        </label>
      </div>
    </div>
  );
}

export default PaginationBar;

import { useState, useEffect, useRef } from "react";
import { ShoppingBasket, ChevronDown, Check, Plus } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { basketService } from "@/services/basket";
import { toast } from "@/stores/ui";
import type { Basket } from "@/types";
import { cn } from "@/lib/utils";

interface AddToBasketDropdownProps {
  resourceType: "question" | "material" | "courseware";
  resourceId: string;
  resourceTitle?: string;
  size?: "sm" | "md";
  variant?: "gold" | "outline" | "ghost";
  onAdded?: () => void;
}

export function AddToBasketDropdown({
  resourceType,
  resourceId,
  resourceTitle,
  size = "sm",
  variant = "gold",
  onAdded,
}: AddToBasketDropdownProps) {
  const { teacher } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [selectedBasketIds, setSelectedBasketIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (teacher) {
      loadBaskets();
    }
  }, [teacher]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadBaskets = async () => {
    if (!teacher) return;
    const bs = await basketService.listBaskets(teacher.id);
    setBaskets(bs);
    const inBaskets = new Set<string>();
    bs.forEach((b) => {
      if (resourceType === "question" && b.questionIds.includes(resourceId)) {
        inBaskets.add(b.id);
      } else if ((resourceType === "material" || resourceType === "courseware") && b.materialIds.includes(resourceId)) {
        inBaskets.add(b.id);
      }
    });
    setSelectedBasketIds(inBaskets);
  };

  const defaultBasket = baskets.find((b) => b.isDefault);

  const handleQuickAdd = async () => {
    if (!teacher || !defaultBasket) return;
    setLoading(true);
    try {
      if (resourceType === "question") {
        await basketService.addQuestion(defaultBasket.id, resourceId);
      } else {
        await basketService.addMaterial(defaultBasket.id, resourceId);
      }
      setSelectedBasketIds((prev) => new Set(prev).add(defaultBasket.id));
      toast.success(`已加入「${defaultBasket.name}」`);
      onAdded?.();
    } catch (e: any) {
      toast.error("加入失败", e?.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBasket = async (basketId: string) => {
    if (!teacher) return;
    const basket = baskets.find((b) => b.id === basketId);
    if (!basket) return;

    const isSelected = selectedBasketIds.has(basketId);
    try {
      if (isSelected) {
        if (resourceType === "question") {
          await basketService.removeQuestion(basketId, resourceId);
        } else {
          await basketService.removeMaterial(basketId, resourceId);
        }
        setSelectedBasketIds((prev) => {
          const next = new Set(prev);
          next.delete(basketId);
          return next;
        });
        toast.success(`已从「${basket.name}」移除`);
      } else {
        if (resourceType === "question") {
          await basketService.addQuestion(basketId, resourceId);
        } else {
          await basketService.addMaterial(basketId, resourceId);
        }
        setSelectedBasketIds((prev) => new Set(prev).add(basketId));
        toast.success(`已加入「${basket.name}」`);
      }
      onAdded?.();
    } catch (e: any) {
      toast.error("操作失败", e?.message);
    }
  };

  const isInDefault = defaultBasket ? selectedBasketIds.has(defaultBasket.id) : false;

  const sizeClasses = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3 py-2 text-sm",
  };

  const variantClasses = {
    gold: isInDefault
      ? "bg-gold-50 text-gold-700 border-gold-200 hover:bg-gold-100"
      : "bg-gold-500 text-white border-gold-500 hover:bg-gold-600",
    outline: "bg-transparent text-ink-700 border-ink-200 hover:border-gold-300 hover:text-gold-600",
    ghost: "bg-transparent text-ink-600 border-transparent hover:bg-mist",
  };

  return (
    <div ref={dropdownRef} className="relative inline-flex">
      <div className="inline-flex rounded-md overflow-hidden border">
        <button
          onClick={handleQuickAdd}
          disabled={loading || !defaultBasket}
          className={cn(
            "font-medium transition-colors flex items-center gap-1.5",
            sizeClasses[size],
            variantClasses[variant],
            loading && "opacity-70 cursor-wait",
          )}
          title={defaultBasket ? `点击加入「${defaultBasket.name}」` : "暂无默认资源篮"}
        >
          <ShoppingBasket className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
          {isInDefault ? "已加入" : defaultBasket?.name || "加入资源篮"}
        </button>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "transition-colors flex items-center justify-center border-l",
            sizeClasses[size],
            variant === "gold"
              ? "bg-gold-500/90 text-white border-gold-400 hover:bg-gold-600"
              : "bg-transparent text-ink-500 border-ink-200 hover:bg-mist",
          )}
          style={{ paddingLeft: size === "sm" ? "6px" : "8px", paddingRight: size === "sm" ? "6px" : "8px" }}
        >
          <ChevronDown className={cn(size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5", open && "rotate-180 transition-transform")} />
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-paper border border-ink-100 rounded-lg shadow-lg z-20 py-1 animate-fade-in">
            <div className="px-3 py-2 border-b border-ink-50">
              <div className="text-xs font-medium text-ink-700">选择资源篮</div>
              <div className="text-[11px] text-ink-400 mt-0.5">勾选可同时加入多个资源篮</div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {baskets.length === 0 ? (
                <div className="py-4 text-center text-xs text-ink-400">
                  暂无资源篮
                </div>
              ) : (
                baskets.map((b) => {
                  const checked = selectedBasketIds.has(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleBasket(b.id)}
                      className={cn(
                        "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-mist transition-colors",
                        checked && "bg-gold-50/50",
                      )}
                    >
                      <div
                        className={cn(
                          "w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
                          checked
                            ? "bg-gold-500 border-gold-500 text-white"
                            : "border-ink-300",
                        )}
                      >
                        {checked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-ink-800 truncate flex items-center gap-1">
                          {b.name}
                          {b.isDefault && (
                            <span className="text-[10px] text-gold-600">默认</span>
                          )}
                        </div>
                        <div className="text-[10px] text-ink-400">
                          {b.questionIds.length} 题 · {b.materialIds.length} 素材
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="px-3 py-2 border-t border-ink-50">
              <button
                onClick={() => {
                  setOpen(false);
                }}
                className="w-full text-xs text-gold-600 hover:text-gold-700 flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" />
                新建资源篮
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

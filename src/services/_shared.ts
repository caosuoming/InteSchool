// 模拟异步延迟
export const delay = (ms: number = 300) => new Promise((resolve) => setTimeout(resolve, ms));

// 生成唯一 ID
export function genId(prefix: string = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 模拟网络抖动错误率
export function maybeThrowError(errorRate: number = 0.005): void {
  if (Math.random() < errorRate) {
    throw new Error("网络异常，请稍后重试");
  }
}

// localStorage 序列化存储工具
const STORAGE_PREFIX = "zhiti:";

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn("Storage write failed", e);
    }
  },
  remove(key: string): void {
    localStorage.removeItem(STORAGE_PREFIX + key);
  },
  clearAll(): void {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  },
};

// 日期格式化
export function formatDate(iso: string, withTime: boolean = false): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (!withTime) return date;
  return `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 相对时间
export function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}

import { randomUUID } from "node:crypto";

export const delay = async (_ms = 0): Promise<void> => undefined;

export function genId(prefix = "id"): string {
  return `${prefix}-${randomUUID()}`;
}

export function appendCopySuffix(name: string): string {
  return `${name}（副本）`;
}

export function maybeThrowError(_errorRate = 0): void {
  // Production services must not inject random failures.
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (!withTime) return date;
  return `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}

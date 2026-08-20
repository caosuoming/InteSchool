export function openPage(path: string): Window | null {
  return window.open(path, "_blank", "noopener,noreferrer");
}

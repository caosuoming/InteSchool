export type OfficeMetafileFormat = "wmf" | "emf";

export interface OfficeMetafileDisplaySize {
  width: number;
  height: number;
}

export interface OfficeMetafileLayout {
  format: OfficeMetafileFormat;
  width: number | null;
  height: number | null;
}

const MAX_DISPLAY_PIXELS = 10_000;

export function parseOfficeMetafileDimension(value: string | null | undefined): number | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_DISPLAY_PIXELS
    ? parsed
    : null;
}

export function parseOfficeMetafileDisplaySize(
  width: string | null | undefined,
  height: string | null | undefined,
): OfficeMetafileDisplaySize | null {
  const parsedWidth = parseOfficeMetafileDimension(width);
  const parsedHeight = parseOfficeMetafileDimension(height);
  return parsedWidth && parsedHeight
    ? { width: parsedWidth, height: parsedHeight }
    : null;
}

export function parseDocumentImageDisplaySize(
  source: string,
): OfficeMetafileDisplaySize | null {
  try {
    const url = new URL(source, "https://inteschool.invalid");
    return parseOfficeMetafileDisplaySize(
      url.searchParams.get("officeWidth"),
      url.searchParams.get("officeHeight"),
    );
  } catch {
    return null;
  }
}

export function documentImageInlineStyle(
  displaySize: OfficeMetafileDisplaySize | null,
): string {
  if (displaySize) {
    return `width:${displaySize.width}px;max-width:100%;height:auto;aspect-ratio:${displaySize.width}/${displaySize.height};object-fit:contain;vertical-align:middle`;
  }
  return "max-width:100%;height:auto;object-fit:contain;vertical-align:middle";
}

export function parseOfficeMetafileLayout(source: string): OfficeMetafileLayout | null {
  try {
    const url = new URL(source, "https://inteschool.invalid");
    const format = url.searchParams.get("officeMetafile");
    if (format !== "wmf" && format !== "emf") return null;
    return {
      format,
      width: parseOfficeMetafileDimension(url.searchParams.get("officeWidth")),
      height: parseOfficeMetafileDimension(url.searchParams.get("officeHeight")),
    };
  } catch {
    return null;
  }
}

export function officeMetafileInlineStyle(layout: OfficeMetafileLayout): string {
  if (layout.width && layout.height) {
    return documentImageInlineStyle({ width: layout.width, height: layout.height });
  }
  return "max-width:100%;max-height:12rem;width:auto;height:auto;object-fit:contain;vertical-align:middle";
}

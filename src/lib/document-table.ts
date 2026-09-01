export interface DocumentTableCell {
  content: string;
  colSpan?: number;
  rowSpan?: number;
  header?: boolean;
}

export type DocumentTable = DocumentTableCell[][];

const TABLE_FRAGMENT_PATTERN = /<table\b[^>]*\bclass=(?:"[^"]*\bdocument-table\b[^"]*"|'[^']*\bdocument-table\b[^']*')[^>]*>[\s\S]*?<\/table>/gi;
const STRUCTURED_MATH_TAG_PATTERN = /<i\s+class=["']math-(?:variable|vector)["']>|<\/i>|<\/?(?:sub|sup)>/gi;
const STRUCTURED_MATH_PLACEHOLDER_PATTERN = /\uE200(\d+)\uE201/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDocumentTableStructuredCell(content: string): string {
  const tags: string[] = [];
  const protectedContent = content.replace(
    STRUCTURED_MATH_TAG_PATTERN,
    (tag) => `\uE200${tags.push(tag) - 1}\uE201`,
  );

  return escapeHtml(protectedContent)
    .replace(/\n/g, "<br>")
    .replace(STRUCTURED_MATH_PLACEHOLDER_PATTERN, (_match, index: string) => tags[Number(index)] || "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_match, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&nbsp;/gi, "\u00a0")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .normalize("NFC");
}

function safeSpan(value: number | undefined): number | undefined {
  if (!Number.isInteger(value) || (value || 0) <= 1 || (value || 0) > 100) return undefined;
  return value;
}

export function serializeDocumentTable(
  table: DocumentTable,
  renderCell: (content: string) => string = (content) => escapeHtml(content).replace(/\n/g, "<br>"),
): string {
  const rows = table
    .filter((row) => row.length > 0)
    .map((row) => `<tr>${row.map((cell) => {
      const tag = cell.header ? "th" : "td";
      const colSpan = safeSpan(cell.colSpan);
      const rowSpan = safeSpan(cell.rowSpan);
      const attributes = [
        colSpan ? ` colspan="${colSpan}"` : "",
        rowSpan ? ` rowspan="${rowSpan}"` : "",
      ].join("");
      return `<${tag}${attributes}>${renderCell(cell.content)}</${tag}>`;
    }).join("")}</tr>`)
    .join("");
  return `<table class="document-table"><tbody>${rows}</tbody></table>`;
}

export function parseDocumentTable(fragment: string): DocumentTable {
  const rows: DocumentTable = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(fragment)) !== null) {
    const row: DocumentTableCell[] = [];
    const cellPattern = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const attributes = cellMatch[2];
      const colSpan = Number(/\bcolspan\s*=\s*["']?(\d+)/i.exec(attributes)?.[1]);
      const rowSpan = Number(/\browspan\s*=\s*["']?(\d+)/i.exec(attributes)?.[1]);
      row.push({
        content: decodeHtml(cellMatch[3]).trim(),
        colSpan: safeSpan(colSpan),
        rowSpan: safeSpan(rowSpan),
        header: cellMatch[1].toLowerCase() === "th",
      });
    }
    if (row.length > 0) rows.push(row);
  }
  return rows;
}

export interface DocumentTableSegment {
  type: "text" | "table";
  value: string;
}

export function splitDocumentTableSegments(value: string): DocumentTableSegment[] {
  const segments: DocumentTableSegment[] = [];
  TABLE_FRAGMENT_PATTERN.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = TABLE_FRAGMENT_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) segments.push({ type: "text", value: value.slice(cursor, match.index) });
    segments.push({ type: "table", value: match[0] });
    cursor = TABLE_FRAGMENT_PATTERN.lastIndex;
  }
  if (cursor < value.length) segments.push({ type: "text", value: value.slice(cursor) });
  return segments.length > 0 ? segments : [{ type: "text", value }];
}

export function isDocumentTableFragment(value: string): boolean {
  const trimmed = value.trim();
  const segments = splitDocumentTableSegments(trimmed);
  return segments.length === 1 && segments[0].type === "table" && segments[0].value === trimmed;
}

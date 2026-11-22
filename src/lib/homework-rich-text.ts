import sanitizeHtml from "sanitize-html";

const PREFIX = "inteschool-homework-html:v1:";
const MAX_HTML_LENGTH = 12000;
export const HOMEWORK_TEXT_LIMIT = 4000;

const colors = [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i];

function sanitizeMarkup(markup: string): string {
  return sanitizeHtml(markup, {
    allowedTags: ["b", "strong", "i", "em", "u", "s", "mark", "span", "p", "div", "br", "ul", "ol", "li", "font"],
    allowedAttributes: { span: ["style"], font: ["color", "size"] },
    allowedStyles: { span: { color: colors, "background-color": colors, "font-size": [/^(?:[6-9]|[1-6][0-9]|7[0-2])px$/] } },
    transformTags: {
      font: (_tag, attrs) => {
        const styles: string[] = [];
        if (attrs.color && colors.some((pattern) => pattern.test(attrs.color))) styles.push(`color:${attrs.color}`);
        const sizes: Record<string, number> = { "1": 10, "2": 13, "3": 16, "4": 18, "5": 24, "6": 32, "7": 48 };
        if (attrs.size && sizes[attrs.size]) styles.push(`font-size:${sizes[attrs.size]}px`);
        return { tagName: "span", attribs: styles.length ? { style: styles.join(";") } : {} };
      },
    },
    disallowedTagsMode: "discard",
  });
}

export function isHomeworkRichText(content: string): boolean {
  return content.startsWith(PREFIX);
}

export function homeworkPlainText(content: string): string {
  if (!isHomeworkRichText(content)) return content;
  const pieces: string[] = [];
  sanitizeHtml(content.slice(PREFIX.length), {
    allowedTags: [],
    textFilter: (text) => { pieces.push(text); return text; },
  });
  return pieces.join("");
}

export function homeworkMarkup(content: string): string | null {
  return isHomeworkRichText(content) ? sanitizeMarkup(content.slice(PREFIX.length)) : null;
}

export function encodeHomeworkMarkup(markup: string): string {
  const clean = sanitizeMarkup(markup);
  if (clean.length > MAX_HTML_LENGTH) throw new Error("作业格式内容过长");
  if (homeworkPlainText(PREFIX + clean).length > HOMEWORK_TEXT_LIMIT) throw new Error("作业内容不能超过 4000 字");
  return PREFIX + clean;
}

export function validateHomeworkContent(content: string): string {
  if (typeof content !== "string") throw new Error("作业内容格式不正确");
  if (!isHomeworkRichText(content)) {
    if (content.trim().length > HOMEWORK_TEXT_LIMIT) throw new Error("作业内容不能超过 4000 字");
    return content.trim();
  }
  if (content.length > MAX_HTML_LENGTH + PREFIX.length) throw new Error("作业格式内容过长");
  return encodeHomeworkMarkup(content.slice(PREFIX.length));
}

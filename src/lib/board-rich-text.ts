import sanitizeHtml from "sanitize-html";

export const BOARD_IMAGE_MAX_BYTES = 280000;
export const BOARD_RICH_TEXT_MAX_LENGTH = 1000000;

function safeEmbeddedImage(src: string): boolean {
  if (/^https?:\/\/[^\s<>"']{1,2048}$/i.test(src)) return true;
  if (src.length > 400000) return false;
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(src);
}

/** Only explicit image data URLs and web images survive. Reject excess bytes before parsing. */
export function cleanBoardRichText(html: string, allowImages = true): string {
  const limit = allowImages ? BOARD_RICH_TEXT_MAX_LENGTH : 12000;
  if (html.length > limit) throw new Error("节点文本内容过大");
  return sanitizeHtml(html, {
    allowedTags: ["b", "strong", "i", "em", "u", "s", "p", "div", "br", "span", "ul", "ol", "li", "code", ...(allowImages ? ["img"] : [])],
    allowedAttributes: { span: ["style"], ...(allowImages ? { img: ["src", "alt"] } : {}) },
    allowedStyles: { span: { color: [/^#[0-9a-fA-F]{3,8}$/], "font-size": [/^(?:[1-9]|[1-4][0-9])px$/] } },
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    exclusiveFilter: (frame) => frame.tag === "img" && !safeEmbeddedImage(frame.attribs.src || ""),
  });
}

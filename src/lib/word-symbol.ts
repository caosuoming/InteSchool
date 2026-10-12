// Legacy Word Symbol font codes are glyph indices, not Unicode characters.
// Word commonly stores them as F0xx private-use code points in w:sym / w:t.
const SYMBOL_RELATIONS: Record<number, string> = {
  0xc9: "⊃",
  0xca: "⊇",
  0xcc: "⊂",
  0xcd: "⊆",
};

function symbolFontByte(codePoint: number): number | null {
  if (codePoint >= 0xf000 && codePoint <= 0xf0ff) return codePoint & 0xff;
  return codePoint <= 0xff ? codePoint : null;
}

export function normalizeWordSymbolText(text: string, font: string): string {
  if (font.trim().toLowerCase() !== "symbol") return text;
  return Array.from(text, (char) => {
    const index = symbolFontByte(char.codePointAt(0)!);
    return index === null ? char : SYMBOL_RELATIONS[index] || char;
  }).join("");
}

export function decodeWordSymbol(font: string, hexCode: string): string | null {
  if (!/^[0-9a-f]{4,6}$/i.test(hexCode)) return null;
  const codePoint = parseInt(hexCode, 16);
  if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
  if (font.trim().toLowerCase() === "symbol") {
    const index = symbolFontByte(codePoint);
    if (index !== null && SYMBOL_RELATIONS[index]) return SYMBOL_RELATIONS[index];
  }
  // Non-PUA Word symbols are already encoded as Unicode, irrespective of font.
  if (codePoint >= 0x20 && !(codePoint >= 0xe000 && codePoint <= 0xf8ff)) {
    return String.fromCodePoint(codePoint);
  }
  return null;
}

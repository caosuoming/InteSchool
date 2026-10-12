import { describe, expect, it } from "vitest";
import { decodeWordSymbol, normalizeWordSymbolText } from "./word-symbol";

describe("legacy Word Symbol font", () => {
  it("decodes Word's private-use and byte-indexed subset symbols", () => {
    expect(decodeWordSymbol("Symbol", "F0CC")).toBe("⊂");
    expect(decodeWordSymbol("Symbol", "00CD")).toBe("⊆");
    expect(decodeWordSymbol("Symbol", "F0C9")).toBe("⊃");
    expect(decodeWordSymbol("Cambria Math", "228A")).toBe("⊊");
  });

  it("only rewrites font-identified legacy text, not arbitrary private-use characters", () => {
    expect(normalizeWordSymbolText("M\uF0CCQ", "Symbol")).toBe("M⊂Q");
    expect(normalizeWordSymbolText("M\uF0CCQ", "Calibri")).toBe("M\uF0CCQ");
    expect(decodeWordSymbol("Wingdings", "F0CC")).toBeNull();
    expect(decodeWordSymbol("Symbol", "not-hex")).toBeNull();
  });
});

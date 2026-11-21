import { describe, expect, it } from "vitest";
import { analyzeChoiceStrip } from "./scanner-choice-omr";

function strip(marked: number[], count = 4, vertical = false) {
  const width = vertical ? 28 : count * 28;
  const height = vertical ? count * 28 : 28;
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  for (let option = 0; option < count; option++) {
    const ox = vertical ? 0 : option * 28;
    const oy = vertical ? option * 28 : 0;
    // Printed characters are small (similar density for all options).
    for (let y = 11; y < 15; y++) for (let x = 12; x < 14; x++) {
      const pos = ((oy + y) * width + ox + x) * 4;
      data[pos] = data[pos + 1] = data[pos + 2] = 20;
    }
    if (marked.includes(option)) {
      for (let y = 8; y < 20; y++) for (let x = 8; x < 20; x++) {
        const pos = ((oy + y) * width + ox + x) * 4;
        data[pos] = data[pos + 1] = data[pos + 2] = 25;
      }
    }
  }
  return { width, height, data };
}

const full = { x: 0, y: 0, width: 1, height: 1 };
describe("scanner candidate OMR", () => {
  it("detects single darkened choice from a teacher-aligned row", () => {
    expect(analyzeChoiceStrip(strip([1]), full, 4, "horizontal").candidate).toBe("B");
  });
  it("detects multiple choices from a vertical column", () => {
    expect(analyzeChoiceStrip(strip([0, 2], 4, true), full, 4, "vertical").candidate).toBe("AC");
  });
  it("leaves blank or uniformly printed choices unresolved", () => {
    const result = analyzeChoiceStrip(strip([]), full, 4, "horizontal");
    expect(result.candidate).toBeNull();
  });
  it("rejects invalid and tiny crop regions", () => {
    expect(analyzeChoiceStrip(strip([1]), { x: -0.1, y: 0, width: 1, height: 1 }, 4, "horizontal").candidate).toBeNull();
    expect(analyzeChoiceStrip(strip([1]), { x: 0, y: 0, width: 0.05, height: 0.05 }, 4, "horizontal").candidate).toBeNull();
    expect(analyzeChoiceStrip(strip([1]), full, 9, "horizontal").candidate).toBeNull();
  });
});

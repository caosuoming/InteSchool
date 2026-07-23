import { afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

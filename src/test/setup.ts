import { afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

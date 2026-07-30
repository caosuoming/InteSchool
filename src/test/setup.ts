import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

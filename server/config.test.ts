import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";

describe("server config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults document extraction concurrency to two", () => {
    vi.stubEnv("INTESCHOOL_DOCUMENT_EXTRACTION_CONCURRENCY", "");

    expect(loadConfig().documentExtractionConcurrency).toBe(2);
  });
});

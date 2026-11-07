import { afterEach, describe, expect, it } from "vitest";
import { defaultProjectTypeKeywords } from "@/lib/document-project-heading-keywords";
import { useExtractConfigStore } from "./extractConfig";

describe("extract project-type keywords", () => {
  afterEach(() => {
    useExtractConfigStore.getState().resetToDefault();
    localStorage.removeItem("zhiti:extract-config");
  });

  it("saves added keywords, prevents duplicates and supports removal", () => {
    const store = useExtractConfigStore;
    store.getState().resetToDefault();
    store.getState().addProjectTypeKeyword("  专题闯关  ");
    store.getState().addProjectTypeKeyword("专题闯关");
    expect(store.getState().projectTypeKeywords.filter((keyword) => keyword === "专题闯关")).toHaveLength(1);

    const saved = JSON.parse(localStorage.getItem("zhiti:extract-config") || "{}");
    expect(saved.version).toBe(4);
    expect(saved.state.projectTypeKeywords).toContain("专题闯关");

    const index = store.getState().projectTypeKeywords.indexOf("专题闯关");
    store.getState().removeProjectTypeKeyword(index);
    expect(store.getState().projectTypeKeywords).not.toContain("专题闯关");
  });

  it("adds defaults when migrating a previously saved keyword configuration", async () => {
    localStorage.setItem("zhiti:extract-config", JSON.stringify({
      version: 3,
      state: { questionKeywords: ["例"], answerKeywords: ["答案"] },
    }));
    await useExtractConfigStore.persist.rehydrate();

    expect(useExtractConfigStore.getState().projectTypeKeywords).toEqual(defaultProjectTypeKeywords);
    expect(useExtractConfigStore.getState().questionKeywords).toContain("例");
  });
});

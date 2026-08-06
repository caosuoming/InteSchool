import { beforeEach, describe, expect, it, vi } from "vitest";
import { basketService } from "@/services/basket";
import {
  REFERENCED_QUESTION_REMOVAL_PROMPT,
  promptToRemoveReferencedBasketQuestions,
} from "@/lib/basket-reference";

vi.mock("@/services/basket", () => ({
  basketService: {
    removeQuestion: vi.fn(),
  },
}));

describe("promptToRemoveReferencedBasketQuestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when the teacher declines removal", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const result = await promptToRemoveReferencedBasketQuestions("basket-1", ["question-1"]);

    expect(confirmSpy).toHaveBeenCalledWith(REFERENCED_QUESTION_REMOVAL_PROMPT);
    expect(basketService.removeQuestion).not.toHaveBeenCalled();
    expect(result).toEqual({ confirmed: false, removedQuestionIds: [], failedQuestionIds: [] });
    confirmSpy.mockRestore();
  });

  it("deduplicates questions and reports partial removal failures", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(basketService.removeQuestion)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("remove failed"));

    const result = await promptToRemoveReferencedBasketQuestions(
      "basket-1",
      ["question-1", "question-1", "question-2"],
    );

    expect(basketService.removeQuestion).toHaveBeenNthCalledWith(1, "basket-1", "question-1");
    expect(basketService.removeQuestion).toHaveBeenNthCalledWith(2, "basket-1", "question-2");
    expect(result).toEqual({
      confirmed: true,
      removedQuestionIds: ["question-1"],
      failedQuestionIds: ["question-2"],
    });
    confirmSpy.mockRestore();
  });
});

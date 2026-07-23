import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ExtractConfigState {
  questionKeywords: string[];
  answerKeywords: string[];
  analysisKeywords: string[];
  summaryKeywords: string[];
  headingKeywords: string[];
  
  addQuestionKeyword: (keyword: string) => void;
  removeQuestionKeyword: (index: number) => void;
  updateQuestionKeyword: (index: number, keyword: string) => void;
  
  addAnswerKeyword: (keyword: string) => void;
  removeAnswerKeyword: (index: number) => void;
  updateAnswerKeyword: (index: number, keyword: string) => void;
  
  addAnalysisKeyword: (keyword: string) => void;
  removeAnalysisKeyword: (index: number) => void;
  updateAnalysisKeyword: (index: number, keyword: string) => void;
  
  addSummaryKeyword: (keyword: string) => void;
  removeSummaryKeyword: (index: number) => void;
  updateSummaryKeyword: (index: number, keyword: string) => void;
  
  addHeadingKeyword: (keyword: string) => void;
  removeHeadingKeyword: (index: number) => void;
  updateHeadingKeyword: (index: number, keyword: string) => void;
  
  resetToDefault: () => void;
}

const defaultQuestionKeywords = [
  "例",
  "变式",
  "拓展",
  "拓",
  "练习",
  "习题",
  "第",
];

const defaultAnswerKeywords = [
  "答案",
  "【答案】",
  "答案：",
  "答：",
  "解：",
];

const defaultAnalysisKeywords = [
  "解析",
  "【解析】",
  "解析：",
  "分析",
  "【分析】",
  "分析：",
  "解题思路",
  "【解题思路】",
];

const defaultSummaryKeywords = [
  "总结",
  "【总结】",
  "总结：",
  "点评",
  "【点评】",
  "点评：",
  "归纳",
  "【归纳】",
];

const defaultHeadingKeywords = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "十一",
  "十二",
];

export const useExtractConfigStore = create<ExtractConfigState>()(
  persist(
    (set) => ({
      questionKeywords: defaultQuestionKeywords,
      answerKeywords: defaultAnswerKeywords,
      analysisKeywords: defaultAnalysisKeywords,
      summaryKeywords: defaultSummaryKeywords,
      headingKeywords: defaultHeadingKeywords,

      addQuestionKeyword: (keyword) =>
        set((state) => ({
          questionKeywords: [...state.questionKeywords, keyword],
        })),
      removeQuestionKeyword: (index) =>
        set((state) => ({
          questionKeywords: state.questionKeywords.filter((_, i) => i !== index),
        })),
      updateQuestionKeyword: (index, keyword) =>
        set((state) => ({
          questionKeywords: state.questionKeywords.map((k, i) =>
            i === index ? keyword : k,
          ),
        })),

      addAnswerKeyword: (keyword) =>
        set((state) => ({
          answerKeywords: [...state.answerKeywords, keyword],
        })),
      removeAnswerKeyword: (index) =>
        set((state) => ({
          answerKeywords: state.answerKeywords.filter((_, i) => i !== index),
        })),
      updateAnswerKeyword: (index, keyword) =>
        set((state) => ({
          answerKeywords: state.answerKeywords.map((k, i) =>
            i === index ? keyword : k,
          ),
        })),

      addAnalysisKeyword: (keyword) =>
        set((state) => ({
          analysisKeywords: [...state.analysisKeywords, keyword],
        })),
      removeAnalysisKeyword: (index) =>
        set((state) => ({
          analysisKeywords: state.analysisKeywords.filter((_, i) => i !== index),
        })),
      updateAnalysisKeyword: (index, keyword) =>
        set((state) => ({
          analysisKeywords: state.analysisKeywords.map((k, i) =>
            i === index ? keyword : k,
          ),
        })),

      addSummaryKeyword: (keyword) =>
        set((state) => ({
          summaryKeywords: [...state.summaryKeywords, keyword],
        })),
      removeSummaryKeyword: (index) =>
        set((state) => ({
          summaryKeywords: state.summaryKeywords.filter((_, i) => i !== index),
        })),
      updateSummaryKeyword: (index, keyword) =>
        set((state) => ({
          summaryKeywords: state.summaryKeywords.map((k, i) =>
            i === index ? keyword : k,
          ),
        })),

      addHeadingKeyword: (keyword) =>
        set((state) => ({
          headingKeywords: [...state.headingKeywords, keyword],
        })),
      removeHeadingKeyword: (index) =>
        set((state) => ({
          headingKeywords: state.headingKeywords.filter((_, i) => i !== index),
        })),
      updateHeadingKeyword: (index, keyword) =>
        set((state) => ({
          headingKeywords: state.headingKeywords.map((k, i) =>
            i === index ? keyword : k,
          ),
        })),

      resetToDefault: () =>
        set({
          questionKeywords: defaultQuestionKeywords,
          answerKeywords: defaultAnswerKeywords,
          analysisKeywords: defaultAnalysisKeywords,
          summaryKeywords: defaultSummaryKeywords,
          headingKeywords: defaultHeadingKeywords,
        }),
    }),
    { name: "zhiti:extract-config" },
  ),
);

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ExtractConfigState {
  questionKeywords: string[];
  answerKeywords: string[];
  analysisKeywords: string[];
  summaryKeywords: string[];
  headingKeywords: string[];
  
  // 题型识别关键字
  singleChoiceKeywords: string[];
  multipleChoiceKeywords: string[];
  fillBlankKeywords: string[];
  essayKeywords: string[];
  
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
  
  addSingleChoiceKeyword: (keyword: string) => void;
  removeSingleChoiceKeyword: (index: number) => void;
  
  addMultipleChoiceKeyword: (keyword: string) => void;
  removeMultipleChoiceKeyword: (index: number) => void;
  
  addFillBlankKeyword: (keyword: string) => void;
  removeFillBlankKeyword: (index: number) => void;
  
  addEssayKeyword: (keyword: string) => void;
  removeEssayKeyword: (index: number) => void;
  
  resetToDefault: () => void;
}

const defaultQuestionKeywords = [
  "例",
  "变式",
  "拓展",
  "拓",
  "练习",
  "训练",
  "习题",
  "第",
];

const defaultAnswerKeywords = [
  "答案",
  "【答案】",
  "答案：",
  "答：",
];

const analysisAsSummaryKeywords = [
  "分析",
  "【分析】",
  "分析：",
];

function isAnalysisAsSummaryKeyword(keyword: string): boolean {
  return keyword
    .replace(/\s+/g, "")
    .replace(/^[【［[(（]+/, "")
    .replace(/[】］\])）:：]+$/, "") === "分析";
}

function uniqueKeywords(keywords: string[]): string[] {
  return keywords.filter((keyword, index) => keyword && keywords.indexOf(keyword) === index);
}

const defaultAnalysisKeywords = [
  "解析",
  "【解析】",
  "解析：",
  "详解",
  "【详解】",
  "详解：",
  "解：",
  "【解】",
  "解题思路",
  "【解题思路】",
];

const defaultSummaryKeywords = [
  "总结",
  "【总结】",
  "总结：",
  "反思感悟",
  "【反思感悟】",
  "反思",
  "【反思】",
  "感悟",
  "【感悟】",
  "点评",
  "【点评】",
  "点评：",
  "归纳",
  "【归纳】",
  "规律方法",
  "【规律方法】",
  "易错提醒",
  "【易错提醒】",
  ...analysisAsSummaryKeywords,
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

// 题型识别关键字
const defaultSingleChoiceKeywords = [
  "单选",
  "单选题",
  "单项选择",
];

const defaultMultipleChoiceKeywords = [
  "多选",
  "多选题",
  "多项选择",
  "至少选",
  "多个正确",
  "不止一个",
];

const defaultFillBlankKeywords = [
  "填空",
  "填空题",
  "请填",
  "___",
  "____",
  "______",
  "（ ）",
  "()",
];

const defaultEssayKeywords = [
  "解答",
  "解答题",
  "计算",
  "计算题",
  "证明",
  "证明题",
  "求解",
  "分析",
  "论述",
  "说明",
];

export const useExtractConfigStore = create<ExtractConfigState>()(
  persist(
    (set) => ({
      questionKeywords: defaultQuestionKeywords,
      answerKeywords: defaultAnswerKeywords,
      analysisKeywords: defaultAnalysisKeywords,
      summaryKeywords: defaultSummaryKeywords,
      headingKeywords: defaultHeadingKeywords,
      singleChoiceKeywords: defaultSingleChoiceKeywords,
      multipleChoiceKeywords: defaultMultipleChoiceKeywords,
      fillBlankKeywords: defaultFillBlankKeywords,
      essayKeywords: defaultEssayKeywords,

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

      // 题型识别关键字操作
      addSingleChoiceKeyword: (keyword) =>
        set((state) => ({
          singleChoiceKeywords: [...state.singleChoiceKeywords, keyword],
        })),
      removeSingleChoiceKeyword: (index) =>
        set((state) => ({
          singleChoiceKeywords: state.singleChoiceKeywords.filter((_, i) => i !== index),
        })),

      addMultipleChoiceKeyword: (keyword) =>
        set((state) => ({
          multipleChoiceKeywords: [...state.multipleChoiceKeywords, keyword],
        })),
      removeMultipleChoiceKeyword: (index) =>
        set((state) => ({
          multipleChoiceKeywords: state.multipleChoiceKeywords.filter((_, i) => i !== index),
        })),

      addFillBlankKeyword: (keyword) =>
        set((state) => ({
          fillBlankKeywords: [...state.fillBlankKeywords, keyword],
        })),
      removeFillBlankKeyword: (index) =>
        set((state) => ({
          fillBlankKeywords: state.fillBlankKeywords.filter((_, i) => i !== index),
        })),

      addEssayKeyword: (keyword) =>
        set((state) => ({
          essayKeywords: [...state.essayKeywords, keyword],
        })),
      removeEssayKeyword: (index) =>
        set((state) => ({
          essayKeywords: state.essayKeywords.filter((_, i) => i !== index),
        })),

      resetToDefault: () =>
        set({
          questionKeywords: defaultQuestionKeywords,
          answerKeywords: defaultAnswerKeywords,
          analysisKeywords: defaultAnalysisKeywords,
          summaryKeywords: defaultSummaryKeywords,
          headingKeywords: defaultHeadingKeywords,
          singleChoiceKeywords: defaultSingleChoiceKeywords,
          multipleChoiceKeywords: defaultMultipleChoiceKeywords,
          fillBlankKeywords: defaultFillBlankKeywords,
          essayKeywords: defaultEssayKeywords,
        }),
    }),
    {
      name: "zhiti:extract-config",
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as Partial<ExtractConfigState>;
        return {
          ...state,
          analysisKeywords: (state.analysisKeywords || defaultAnalysisKeywords)
            .filter((keyword) => !isAnalysisAsSummaryKeyword(keyword)),
          summaryKeywords: uniqueKeywords([
            ...(state.summaryKeywords || defaultSummaryKeywords),
            ...analysisAsSummaryKeywords,
          ]),
        };
      },
    },
  ),
);

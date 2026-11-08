import { DEFAULT_QUESTION_TYPES, type QuestionType } from "@/types";

export interface QuestionTypeOption {
  value: QuestionType;
  label: string;
}

export const ENGLISH_QUESTION_TYPE_OPTIONS: QuestionTypeOption[] = [
  { value: "englishListeningChoice", label: "听力选择题" },
  { value: "englishListeningFill", label: "听力填空" },
  { value: "englishSingle", label: "单项选择" },
  { value: "englishReading", label: "阅读理解" },
  { value: "englishCloze", label: "完形填空" },
  { value: "englishGrammarFill", label: "语法填空" },
  { value: "englishCorrection", label: "改错" },
  { value: "englishWordSelection", label: "选词填空" },
  { value: "englishTranslation", label: "翻译" },
  { value: "englishSentenceCompletion", label: "完成句子" },
  { value: "englishSpelling", label: "单词拼写" },
  { value: "englishPassageFill", label: "短文填空" },
  { value: "englishComposition", label: "书面表达" },
  { value: "englishLetter", label: "书信写作" },
];

export function questionTypeOptionsForSubject(subject?: string, options?: QuestionTypeOption[]): QuestionTypeOption[] {
  return subject?.trim() === "英语" ? ENGLISH_QUESTION_TYPE_OPTIONS : (options || DEFAULT_QUESTION_TYPE_OPTIONS);
}

export function isChoiceQuestionType(type: QuestionType): boolean {
  return ["single", "multiple", "englishSingle", "englishListeningChoice"].includes(type);
}

export const DEFAULT_QUESTION_TYPE_OPTIONS: QuestionTypeOption[] = DEFAULT_QUESTION_TYPES.map(
  (option) => ({ ...option }),
);

const DEFAULT_QUESTION_TYPE_LABELS = new Map(
  [...DEFAULT_QUESTION_TYPE_OPTIONS, ...ENGLISH_QUESTION_TYPE_OPTIONS].map((option) => [option.value, option.label] as const),
);

export function getDefaultQuestionTypeLabel(value: QuestionType): string {
  return DEFAULT_QUESTION_TYPE_LABELS.get(value) || value;
}

export function normalizeQuestionTypeForSubject(
  type: QuestionType,
  subject?: string,
): QuestionType {
  return subject?.trim() === "数学" && type === "comprehensive" ? "essay" : type;
}

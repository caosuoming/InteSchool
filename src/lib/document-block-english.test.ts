import { describe, expect, it } from "vitest";
import { parseDocumentBlocks, type DocumentParseConfig } from "./document-block-parser";

const config: DocumentParseConfig = {
  subject: "英语",
  headingKeywords: ["一", "二", "三", "四"],
  questionKeywords: ["例", "练习", "第"],
  answerKeywords: ["答案", "【答案】"],
  analysisKeywords: ["解析", "【解析】"],
  summaryKeywords: ["总结", "【总结】"],
  singleChoiceKeywords: ["单选"],
  multipleChoiceKeywords: ["多选"],
  fillBlankKeywords: ["填空"],
  essayKeywords: ["写作", "作文"],
};

const parse = (lines: string[]) => parseDocumentBlocks(lines.join("\n"), config);

describe("English exam document extraction", () => {
  it("preserves the document title and splits one-recording-one-question listening", () => {
    const blocks = parse([
      "高三英语模拟卷", "考试时间 120 分钟", "第一部分 听力",
      "听下面5段录音，每段录音后有一个小题",
      "1. What is the man's name?", "A. John", "B. Mike", "C. Bob", "【答案】B", "【原文】M: My name is Mike.",
      "2. Where are they?", "A. School", "B. Home", "C. Park", "【答案】C", "【原文】W: We are in the park.",
    ]);
    expect(blocks[0]).toMatchObject({ type: "documentTitle", content: "高三英语模拟卷" });
    expect(blocks[1]).toMatchObject({ type: "documentInfo", content: "考试时间 120 分钟" });
    const questions = blocks.filter((block) => block.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ content: "1. What is the man's name?", options: ["John", "Mike", "Bob"], answer: "B" });
    expect(questions[0].analysis).toContain("【原文】M: My name is Mike.");
    expect(questions[1]).toMatchObject({ content: "2. Where are they?", options: ["School", "Home", "Park"], answer: "C" });
    expect(questions[1].analysis).not.toContain("Mike");
  });

  it("matches a shared numbered answer key to individual listening questions", () => {
    const questions = parse([
      "第一部分 听力", "听下面5段录音，每段录音后有一个小题",
      "1. Where is Alice?", "A. At home B. At school C. Outside",
      "2. What time is it?", "A. 8 B. 9 C. 10",
      "【答案】1. A 2. B", "【原文】The recordings for 1 and 2.",
    ]).filter((block) => block.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions.map((block) => block.answer)).toEqual(["A", "B"]);
  });

  it("keeps multiple listening subquestions together and starts a new group at the next recording", () => {
    const questions = parse([
      "第一部分 听力", "听下面5段录音。每段录音后有几个小题",
      "听下面一段对话，回答以下小题", "6. How old is he?", "A. 10 B. 11 C. 12",
      "7. What does he like?", "A. Music B. Sports C. Art",
      "【答案】6. B 7. A", "【原文】M: I'm eleven years old.",
      "听下面一段对话，回答以下小题", "8. Where did she go?", "A. A park B. A shop C. A zoo",
      "9. Why?", "A. For food B. For a gift C. For fun",
      "【答案】8. C 9. B", "【原文】W: We went to the zoo.",
    ]).filter((block) => block.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ questionType: "comprehensive", answer: "6. B 7. A" });
    expect(questions[0].content).toContain("7. What does he like?");
    expect(questions[0].content).toContain("C. Art");
    expect(questions[1].content).toContain("8. Where did she go?");
    expect(questions[1].content).not.toContain("6. How old");
  });

  it("treats reading passages A-D as independent question groups with mapped commentary", () => {
    const blocks = parse([
      "第一部分 阅读理解", "A", "An article about the sun.",
      "21. What does the sun give us?", "A. Light B. Rain C. Food D. Snow",
      "22. What does the author suggest?", "A. Sleep B. Read C. Run D. Hide",
      "【答案】21. A 22. B", "【导语】本文介绍太阳。",
      "【21题详解】阳光提供光。", "【22题详解】作者建议阅读。",
      "B", "An article about the sea.", "23. Where are the fish?", "A. Sea B. Sky C. Land D. Tree",
      "【答案】23. A", "【导语】本文介绍海洋。",
    ]);
    expect(blocks.filter((block) => block.type === "groupTitle").map((block) => block.content)).toEqual(["第一部分 阅读理解", "A", "B"]);
    const questions = blocks.filter((block) => block.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions[0].content).toContain("An article about the sun.");
    expect(questions[0].answer).toBe("21. A 22. B");
    expect(questions[0].summary).toBe("本文介绍太阳。");
    expect(questions[0].analysis).toContain("【21题详解】阳光提供光。");
    expect(questions[0].analysis).toContain("【22题详解】作者建议阅读。");
    expect(questions[1].content).toContain("23. Where are the fish?");
  });

  it("keeps reading sentence insertion blanks and A-G options in one question", () => {
    const blocks = parse([
      "第二部分 阅读理解", "阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项",
      "The sky is blue. __36__", "The moon shines. __37__", "A. It is green.", "B. It shines at night.",
      "C. It is large.", "D. The sky is clear.", "E. We sleep.", "F. We eat.", "G. We run.",
      "【答案】36. D 37. B", "【导语】本文介绍自然。", "【36题详解】第一空选D。", "【37题详解】第二空选B。",
    ]);
    const questions = blocks.filter((block) => block.type === "question");
    expect(questions).toHaveLength(1);
    expect(questions[0].questionType).toBe("comprehensive");
    expect(questions[0].content).toContain("__36__");
    expect(questions[0].content).toContain("G. We run.");
    expect(questions[0].answer).toBe("36. D 37. B");
    expect(questions[0].analysis).toContain("【37题详解】第二空选B。");
  });

  it("groups language use by sections and preserves subquestion-level answers and analysis", () => {
    const blocks = parse([
      "第三部分 语言运用", "第一节 完形填空", "Read the passage and choose.",
      "41. A. went B. goes C. going D. gone", "42. A. blue B. red C. green D. pink",
      "【答案】41. A 42. B", "【导语】文章叙述经历。", "【41题详解】过去式。", "【42题详解】颜色。",
      "第二节 语法填空", "Fill in the blanks.", "56. He ____(go) to work.", "57. She ____(be) happy.",
      "【答案】56. goes 57. is", "【详解】根据主谓一致。",
    ]);
    const questions = blocks.filter((block) => block.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions[0].content).toContain("42. A. blue");
    expect(questions[0].answer).toBe("41. A 42. B");
    expect(questions[0].summary).toBe("文章叙述经历。");
    expect(questions[1].content).toContain("57. She");
    expect(questions[1].answer).toBe("56. goes 57. is");
    expect(questions[1].analysis).toBe("根据主谓一致。");
  });

  it("splits writing by sections and routes explanations and key points correctly", () => {
    const blocks = parse([
      "第四部分 写作", "第一节 应用文写作", "66. 请写一封邀请信。", "【答案】Dear Tom, please come.",
      "【导语】应用文。", "【详解】注意格式。", "【点睛】邀请语气要得体。",
      "第二节 读后续写", "67. 阅读材料后续写。", "【答案】Once upon a time...", "【详解】故事需要连贯。",
    ]);
    const questions = blocks.filter((block) => block.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ questionType: "essay", answer: "Dear Tom, please come.", analysis: "注意格式。" });
    expect(questions[0].summary).toContain("应用文。");
    expect(questions[0].summary).toContain("邀请语气要得体。");
    expect(questions[1]).toMatchObject({ questionType: "essay", answer: "Once upon a time...", analysis: "故事需要连贯。" });
  });

  it("does not override the common parser for non-English subjects or ordinary English exercises", () => {
    const lines = ["一、单项选择题", "1. What is one plus one? A. 1 B. 2 C. 3", "【答案】B"];
    const english = parse(lines);
    const math = parseDocumentBlocks(lines.join("\n"), { ...config, subject: "数学" });
    expect(english.map((block) => block.type)).toEqual(math.map((block) => block.type));
    expect(english[1].answer).toBe("B");
  });
});

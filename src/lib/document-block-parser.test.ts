import { describe, expect, it } from "vitest";
import { parseDocumentBlocks, type DocumentParseConfig } from "./document-block-parser";

const config: DocumentParseConfig = {
  headingKeywords: ["一", "二", "三", "四"],
  questionKeywords: ["例", "例题", "练习", "习题", "变式", "拓展", "第"],
  answerKeywords: ["答案", "【答案】", "答案：", "答："],
  analysisKeywords: ["解析", "【解析】", "解析："],
  summaryKeywords: ["总结", "【总结】", "总结："],
  singleChoiceKeywords: ["单选", "单项选择"],
  multipleChoiceKeywords: ["多选", "多项选择", "多个正确", "不止一个"],
  fillBlankKeywords: ["填空", "___"],
  essayKeywords: ["解答", "计算", "证明"],
};

describe("document block parser", () => {
  it("keeps formulas and extracts inline options", () => {
    const blocks = parseDocumentBlocks(
      [
        "一、单项选择题",
        "1. 已知 $\\frac{x}{2}=1$，则 x 的值为 A. 1 B. 2 C. 3 D. 4",
        "答案：B",
        "解析：由等式两边同乘 2 得 x=2。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "heading", content: "一、单项选择题" });
    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "single",
      content: "1. 已知 $\\frac{x}{2}=1$，则 x 的值为",
      options: ["1", "2", "3", "4"],
      answer: "B",
      analysis: "由等式两边同乘 2 得 x=2。",
    });
  });

  it("keeps document images in the question stem after option lines", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 如图，判断下列结论。",
        "A. 甲 B. 乙 C. 丙 D. 丁",
        "![文档图片](/api/files/file-1/assets/rId5)",
        "答案：A",
        "解析：由图可知。",
      ].join("\n"),
      config,
    );

    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "1. 如图，判断下列结论。\n![文档图片](/api/files/file-1/assets/rId5)",
      options: ["甲", "乙", "丙", "丁"],
      answer: "A",
      analysis: "由图可知。",
    });
  });

  it("uses section context and multi-letter answers to distinguish multiple choice", () => {
    const blocks = parseDocumentBlocks(
      [
        "一、多项选择题",
        "1. 下列结论正确的是",
        "A. 集合 A 是集合 B 的子集",
        "B. 点 A 在直线 l 上",
        "C. 函数 f(x) 单调递增",
        "D. 向量 a 与 b 平行",
        "答案：A、C",
      ].join("\n"),
      config,
    );

    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "multiple",
      options: [
        "集合 A 是集合 B 的子集",
        "点 A 在直线 l 上",
        "函数 f(x) 单调递增",
        "向量 a 与 b 平行",
      ],
      answer: "A、C",
    });
  });

  it("recognizes parenthesized option labels and keeps circled numbering in the stem", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 请选择正确答案",
        "(A) 甲 (B) 乙 (C) 丙 (D) 丁",
        "答案：D",
        "2. 比较下列各组结论：",
        "① 甲成立；② 乙不成立；③ 丙成立。",
        "答案：①③",
      ].join("\n"),
      config,
    );

    expect(blocks[0].options).toEqual(["甲", "乙", "丙", "丁"]);
    expect(blocks[1]).toMatchObject({
      content: "2. 比较下列各组结论：\n① 甲成立；② 乙不成立；③ 丙成立。",
      options: [],
      answer: "①③",
    });
  });

  it("maps a trailing 答案与解析 section back to numbered questions", () => {
    const blocks = parseDocumentBlocks(
      [
        "一、单项选择题",
        "1. 计算 1+1 的值 A. 1 B. 2 C. 3 D. 4",
        "2. 判断下列说法：① 甲正确；② 乙错误。 A. 仅① B. 仅② C. ①② D. 都不正确",
        "答案与解析",
        "1. 【答案】B",
        "【解析】直接计算可得 1+1=2。",
        "【总结】注意基本运算。",
        "2. 答案：C 解析：两项判断均成立。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toMatchObject({
      type: "question",
      content: "1. 计算 1+1 的值",
      options: ["1", "2", "3", "4"],
      answer: "B",
      analysis: "直接计算可得 1+1=2。",
      summary: "注意基本运算。",
    });
    expect(blocks[2]).toMatchObject({
      type: "question",
      content: "2. 判断下列说法：① 甲正确；② 乙错误。",
      options: ["仅①", "仅②", "①②", "都不正确"],
      answer: "C",
      analysis: "两项判断均成立。",
    });
  });

  it("supports 答案和解析, full-width numbers, and continuation paragraphs", () => {
    const blocks = parseDocumentBlocks(
      [
        "１．写出方程 x=1 的解。",
        "２．证明两个偶数之和仍为偶数。",
        "答案和解析：",
        "１．答案：x=1。",
        "解析：代入原方程即可。",
        "２．【答案】命题成立。【解析】设两个偶数分别为 2m 和 2n。",
        "其和为 2(m+n)，所以仍为偶数。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      answer: "x=1。",
      analysis: "代入原方程即可。",
    });
    expect(blocks[1]).toMatchObject({
      answer: "命题成立。",
      analysis: "设两个偶数分别为 2m 和 2n。\n其和为 2(m+n)，所以仍为偶数。",
    });
  });

  it("splits keyword-labelled questions without requiring a separator", () => {
    const blocks = parseDocumentBlocks(
      [
        "例1已知函数 f(x)=x+1，求 f(1)。",
        "练习1计算 2+2 的值。",
        "变式1若 x+1=3，求 x。",
        "拓展1证明两个奇数之和为偶数。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(4);
    expect(blocks.map((block) => block.type)).toEqual([
      "question",
      "question",
      "question",
      "question",
    ]);
    expect(blocks.map((block) => block.content)).toEqual([
      "例1已知函数 f(x)=x+1，求 f(1)。",
      "练习1计算 2+2 的值。",
      "变式1若 x+1=3，求 x。",
      "拓展1证明两个奇数之和为偶数。",
    ]);
  });

  it("recognizes decorated and full-width keyword labels", () => {
    const blocks = parseDocumentBlocks(
      [
        "【例１】已知 x=1，求 x+1。",
        "变式（2）求方程 x=2 的解。",
        "拓展三证明命题成立。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(3);
    expect(blocks.every((block) => block.type === "question")).toBe(true);
  });

  it("keeps prose as a knowledge block instead of inventing a question", () => {
    const blocks = parseDocumentBlocks(
      "集合是由确定对象组成的整体。\n集合中的对象称为元素。",
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "knowledge",
      content: "集合是由确定对象组成的整体。\n集合中的对象称为元素。",
    });
  });

  it("keeps unlabelled essay solution steps out of the question stem", () => {
    const blocks = parseDocumentBlocks(
      [
        "四、例题精讲",
        "例1 已知椭圆 E，(1) 求切点坐标；(2) 证明存在常数 λ，并求 λ 的值。",
        "由 T(2,1) 知直线斜率，可设辅助直线方程。",
        "联立两条直线可得交点 P 的坐标。",
        "故存在常数 λ，使等式成立。",
        "【答案】(1) T(2,1)；(2) λ=4/5。",
        "【解析】代入椭圆方程并利用判别式求解。",
        "【总结】利用直线与圆锥曲线的位置关系。",
      ].join("\n"),
      config,
    );

    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "essay",
      content: "例1 已知椭圆 E，(1) 求切点坐标；(2) 证明存在常数 λ，并求 λ 的值。",
      answer: "(1) T(2,1)；(2) λ=4/5。",
      summary: "利用直线与圆锥曲线的位置关系。",
    });
    expect(blocks[1].analysis).toBe([
      "由 T(2,1) 知直线斜率，可设辅助直线方程。",
      "联立两条直线可得交点 P 的坐标。",
      "故存在常数 λ，使等式成立。",
      "代入椭圆方程并利用判别式求解。",
    ].join("\n"));
  });

  it("treats legacy 解： markers and their continuation as analysis", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 计算 $x^2=4$ 的所有实数解。",
        "解：两边开平方，得到 $x=\\pm 2$。",
        "所以原方程有两个实数解。",
        "答案：$x=\\pm 2$。",
      ].join("\n"),
      { ...config, answerKeywords: [...config.answerKeywords, "解："] },
    );

    expect(blocks[0]).toMatchObject({
      content: "1. 计算 $x^2=4$ 的所有实数解。",
      answer: "$x=\\pm 2$。",
      analysis: "两边开平方，得到 $x=\\pm 2$。\n所以原方程有两个实数解。",
    });
  });

  it("keeps answer continuation paragraphs in the answer field", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 写出方程的解。",
        "答案：第一种情形为 x=1。",
        "第二种情形为 x=-1。",
        "解析：分别代入验证。",
      ].join("\n"),
      config,
    );

    expect(blocks[0]).toMatchObject({
      answer: "第一种情形为 x=1。\n第二种情形为 x=-1。",
      analysis: "分别代入验证。",
    });
  });

  it("keeps a standalone proof requirement in the question stem", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 已知函数 f(x) 在定义域内连续。",
        "证明：函数 f(x) 在该区间上存在零点。",
        "答案：命题成立。",
        "解析：使用零点存在定理。",
      ].join("\n"),
      config,
    );

    expect(blocks[0]).toMatchObject({
      content: "1. 已知函数 f(x) 在定义域内连续。\n证明：函数 f(x) 在该区间上存在零点。",
      answer: "命题成立。",
      analysis: "使用零点存在定理。",
    });
  });

  it("recognizes a labelled proof after an existing proof request", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 求证函数 f(x) 在该区间上存在零点。",
        "证明：由连续性和端点异号可得结论。",
        "答案：命题成立。",
      ].join("\n"),
      config,
    );

    expect(blocks[0]).toMatchObject({
      content: "1. 求证函数 f(x) 在该区间上存在零点。",
      answer: "命题成立。",
      analysis: "由连续性和端点异号可得结论。",
    });
  });
});

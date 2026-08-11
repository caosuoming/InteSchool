import { describe, expect, it } from "vitest";
import { parseDocumentBlocks, type DocumentParseConfig } from "./document-block-parser";

const config: DocumentParseConfig = {
  headingKeywords: ["一", "二", "三", "四"],
  questionKeywords: ["例", "例题", "练习", "习题", "变式", "拓展", "第"],
  answerKeywords: ["答案", "【答案】", "答案：", "答："],
  analysisKeywords: ["解析", "【解析】", "解析：", "分析", "【分析】", "分析："],
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
    expect(blocks[0]).toMatchObject({ type: "groupTitle", content: "一、单项选择题" });
    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "single",
      content: "1. 已知 $\\frac{x}{2}=1$，则 x 的值为",
      options: ["1", "2", "3", "4"],
      answer: "B",
      analysis: "由等式两边同乘 2 得 x=2。",
    });
  });

  it.each([
    "一、选择题",
    "一、单选题",
    "二、多选题",
    "三、填空题",
    "四、解答题",
  ])("recognizes %s as a question-section title", (heading) => {
    const blocks = parseDocumentBlocks(
      [heading, "1. 示例题目。"].join("\n"),
      { ...config, headingKeywords: [] },
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "groupTitle", content: heading });
    expect(blocks[1]).toMatchObject({ type: "question" });
  });

  it.each([
    [
      "一、选择题（本题共8小题，每小题5分，共40分，在每小题给出的四个选项中，只有一项是符合题目要求的。）",
      "single",
    ],
    [
      "二、多选题（本大题共3小题，每小题6分，共18分，在每小题给出的选项中，部分选对得部分分。）",
      "multiple",
    ],
    [
      "一 \u200B、 选 择 题 （本题共8小题，每小题5分，共40分）",
      "single",
    ],
    [
      "二\u2060、 多 项 选 择 题：本大题共3小题，每小题6分",
      "multiple",
    ],
  ] as const)("recognizes noisy extracted section heading %s", (heading, questionType) => {
    const blocks = parseDocumentBlocks(
      [heading, "1. 示例题目 A. 甲 B. 乙 C. 丙 D. 丁"].join("\n"),
      { ...config, headingKeywords: [] },
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "groupTitle", content: heading });
    expect(blocks[1]).toMatchObject({ type: "question", questionType });
  });

  it.each([
    "分析：注意题目中的隐含条件。",
    "【分析】注意题目中的隐含条件。",
    "分析 注意题目中的隐含条件。",
  ])("classifies %s as summary instead of analysis", (analysisLine) => {
    const blocks = parseDocumentBlocks(
      [
        "1. 计算 1+1。",
        "答案：2",
        "解析：直接计算即可。",
        analysisLine,
      ].join("\n"),
      config,
    );

    expect(blocks[0]).toMatchObject({
      answer: "2",
      analysis: "直接计算即可。",
      summary: "注意题目中的隐含条件。",
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

  it("extracts options that share a line with the first question image in a multiple-choice section", () => {
    const blocks = parseDocumentBlocks(
      [
        "二、多项选择题：本大题共4小题，共24分。",
        "9. 已知全集为 U，则下图阴影部分表示正确的为（　）",
        "![文档图片](/api/files/file-1/assets/rId5) A. $C_A(A \\cap B)$ B. $(C_U A) \\cap (C_U B)$ C. $(C_U B) \\cap A$ D. $C_U(A \\cap B)$",
        "答案：AC",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "multiple",
      content: [
        "9. 已知全集为 U，则下图阴影部分表示正确的为（　）",
        "![文档图片](/api/files/file-1/assets/rId5)",
      ].join("\n"),
      options: [
        "$C_A(A \\cap B)$",
        "$(C_U A) \\cap (C_U B)$",
        "$(C_U B) \\cap A$",
        "$C_U(A \\cap B)$",
      ],
      answer: "AC",
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

  it("classifies 分析 markers in a trailing solution section as summary", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 计算 1+1 的值 A. 1 B. 2 C. 3 D. 4",
        "答案与解析",
        "1. 【答案】B",
        "【解析】直接计算可得。",
        "【分析】注意基础运算规则。",
      ].join("\n"),
      config,
    );

    expect(blocks[0]).toMatchObject({
      answer: "B",
      analysis: "直接计算可得。",
      summary: "注意基础运算规则。",
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

  it.each([
    "参考答案",
    "答案",
    "答案解析",
    "参考答案及解析",
    "参考答案与解析",
  ])("maps an unlabelled trailing %s section and treats 详解 as analysis", (heading) => {
    const blocks = parseDocumentBlocks(
      [
        "1. 计算集合运算的结果 A. 甲 B. 乙 C. 丙 D. 丁",
        "2. 判断复数等式 A. 甲 B. 乙 C. 丙 D. 丁",
        heading,
        "1. D",
        "【详解】由集合定义直接计算可得。",
        "2. C",
        "详解：设复数 z=a+bi，再比较实部与虚部。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      answer: "D",
      analysis: "由集合定义直接计算可得。",
    });
    expect(blocks[1]).toMatchObject({
      answer: "C",
      analysis: "设复数 z=a+bi，再比较实部与虚部。",
    });
  });

  it("treats numbered sub-question detail markers as analysis", () => {
    const blocks = parseDocumentBlocks(
      [
        "18. 已知函数 f(x)，完成下列各问。",
        "答案与解析",
        "18. 【答案】（1）命题成立；（2）x=2。",
        "【小问1详解】先证明函数在区间上单调。",
        "小问2详解：再代入边界条件求得 x=2。",
        "【小问３详解】最后检验结果满足原条件。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      answer: "（1）命题成立；（2）x=2。",
      analysis: [
        "【小问1详解】先证明函数在区间上单调。",
        "小问2详解：再代入边界条件求得 x=2。",
        "【小问３详解】最后检验结果满足原条件。",
      ].join("\n"),
    });
  });

  it("recognizes numbered sub-question detail markers in inline answer regions", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 已知函数 f(x)，完成两个小问。",
        "答案：（1）递增；（2）最小值为 0。",
        "【小问1详解】由导数恒正可知函数递增。",
        "小问2详解 根据单调性可得最小值为 0。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      answer: "（1）递增；（2）最小值为 0。",
      analysis: "【小问1详解】由导数恒正可知函数递增。\n小问2详解 根据单调性可得最小值为 0。",
    });
  });

  it("maps compact answer keys from a trailing 答案 section", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 第一题 A. 甲 B. 乙 C. 丙 D. 丁",
        "2. 第二题 A. 甲 B. 乙 C. 丙 D. 丁",
        "3. 第三题 A. 甲 B. 乙 C. 丙 D. 丁",
        "答案",
        "1. A  2. C  3. D",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.answer)).toEqual(["A", "C", "D"]);
  });

  it("maps a horizontal table answer key back to numbered questions", () => {
    const answerTable = '<table class="document-table"><tbody>'
      + '<tr><td>题号</td><td>1</td><td>2</td><td>3</td></tr>'
      + '<tr><td>答案</td><td>A</td><td>BC</td><td>D</td></tr>'
      + '</tbody></table>';
    const blocks = parseDocumentBlocks(
      [
        "1. 第一题 A. 甲 B. 乙 C. 丙 D. 丁",
        "2. 第二题 A. 甲 B. 乙 C. 丙 D. 丁",
        "3. 第三题 A. 甲 B. 乙 C. 丙 D. 丁",
        "参考答案",
        answerTable,
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => block.answer)).toEqual(["A", "BC", "D"]);
    expect(blocks.map((block) => block.questionType)).toEqual(["single", "multiple", "single"]);
  });

  it("maps a vertical table answer key back to numbered questions", () => {
    const answerTable = '<table class="document-table"><tbody>'
      + '<tr><th>题号</th><th>答案</th></tr>'
      + '<tr><td>1</td><td>B</td></tr>'
      + '<tr><td>2</td><td>A、D</td></tr>'
      + '</tbody></table>';
    const blocks = parseDocumentBlocks(
      [
        "1. 第一题 A. 甲 B. 乙 C. 丙 D. 丁",
        "2. 第二题 A. 甲 B. 乙 C. 丙 D. 丁",
        "答案",
        answerTable,
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => block.answer)).toEqual(["B", "A、D"]);
  });

  it("keeps a data table inside the question stem", () => {
    const dataTable = '<table class="document-table"><tbody>'
      + '<tr><td>X</td><td>0</td><td>1</td><td>2</td></tr>'
      + '<tr><td>P</td><td>$k(1-\\alpha)^2$</td><td>$k\\alpha$</td><td>$k$</td></tr>'
      + '</tbody></table>';
    const blocks = parseDocumentBlocks(
      [
        "18. 某商品购买数量 X 的分布列如下：",
        dataTable,
        "求 X 的数学期望。",
        "答案：略",
      ].join("\n"),
      config,
    );

    expect(blocks[0]).toMatchObject({
      type: "question",
      content: `18. 某商品购买数量 X 的分布列如下：\n${dataTable}\n求 X 的数学期望。`,
      answer: "略",
    });
  });

  it("keeps numbered sub-question answers together before trailing analysis", () => {
    const blocks = parseDocumentBlocks(
      [
        "2. 前一道题。",
        "18. 已知函数 f(x)，完成下列各问。",
        "答案与解析",
        "18. （1）证明见解析；",
        "（2）（i）证明见解析；（ii）$m\\le e-1$。",
        "【详解】（1）解法一：先研究函数的单调性。",
        "再由零点存在性完成证明。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({
      content: "18. 已知函数 f(x)，完成下列各问。",
      answer: "（1）证明见解析；\n（2）（i）证明见解析；（ii）$m\\le e-1$。",
      analysis: "（1）解法一：先研究函数的单调性。\n再由零点存在性完成证明。",
    });
    expect(blocks[0].answer).toBeUndefined();
  });

  it("does not reinterpret an inline 答案 label as a trailing answer section", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 第一题 A. 甲 B. 乙 C. 丙 D. 丁",
        "答案",
        "A",
        "解析：第一题解析。",
        "2. 第二题 A. 甲 B. 乙 C. 丙 D. 丁",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ answer: "A", analysis: "第一题解析。" });
    expect(blocks[1]).toMatchObject({ content: "2. 第二题" });
    expect(blocks[1].answer).toBeUndefined();
    expect(blocks[1].analysis).toBeUndefined();
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

  it("separates document title and information before structured content", () => {
    const blocks = parseDocumentBlocks(
      [
        "2026 年春季学期数学阶段检测",
        "考试时间：90 分钟",
        "满分：100 分",
        "一、单项选择题",
        "1. 计算 1+1 的值 A. 1 B. 2 C. 3 D. 4",
        "答案：B",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "documentTitle",
      "documentInfo",
      "groupTitle",
      "question",
    ]);
    expect(blocks[0].content).toBe("2026 年春季学期数学阶段检测");
    expect(blocks[1].content).toBe("考试时间：90 分钟\n满分：100 分");
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

  it("treats bare 解 as the start of analysis", () => {
    const blocks = parseDocumentBlocks(
      [
        "2. 已知数列 {an}，求其通项公式。",
        "解 （1）因为 $4S_n+1=3S_n-9$，",
        "所以可得 $a_n=-\\frac{3^{n+1}}{4^n}$。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "2. 已知数列 {an}，求其通项公式。",
      analysis: "（1）因为 $4S_n+1=3S_n-9$，\n所以可得 $a_n=-\\frac{3^{n+1}}{4^n}$。",
    });
  });

  it.each(["（1）证明 命题成立。", "（2）证明：命题成立。", "（1）证 命题成立。", "（2）证明由导数符号可得。"]) (
    "treats proof sub-question line %s as analysis when the stem asks for a proof",
    (solutionLine) => {
      const blocks = parseDocumentBlocks(
        [
          "18. 已知函数 f(x)，（1）求单调区间；（2）求证 f(x)≥0。",
          solutionLine,
          "由导数符号即可得到结论。",
        ].join("\n"),
        config,
      );

      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toBe("18. 已知函数 f(x)，（1）求单调区间；（2）求证 f(x)≥0。");
      expect(blocks[0].analysis).toBe(`${solutionLine}\n由导数符号即可得到结论。`);
    },
  );

  it("recognizes 训练 labels as question starts even with an older saved keyword config", () => {
    const blocks = parseDocumentBlocks(
      [
        "训练1 已知 x+1=3，求 x。",
        "解 x=2。",
        "训练2 求证两个偶数之和仍为偶数。",
        "（1）证 设两个偶数分别为 2m、2n。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "question", analysis: "x=2。" });
    expect(blocks[1]).toMatchObject({
      type: "question",
      analysis: "（1）证 设两个偶数分别为 2m、2n。",
    });
  });

  it.each([
    "规律方法：注意等价转化。",
    "【规律方法】注意等价转化。",
    "易错提醒：不要漏掉端点。",
    "【易错提醒】不要漏掉端点。",
  ])("classifies %s as summary", (summaryLine) => {
    const blocks = parseDocumentBlocks(
      [
        "1. 计算 1+1。",
        "解 直接计算可得 2。",
        summaryLine,
      ].join("\n"),
      config,
    );

    expect(blocks[0].summary).toMatch(/注意等价转化|不要漏掉端点/);
  });

  it("classifies bracketed and 热点 headings as project group titles", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 求数列的最值。",
        "解 由单调性可得。",
        "【热点突破】",
        "热点一 求数列和式的最值、范围",
        "训练1 求数列的最大项。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => [block.type, block.content])).toEqual([
      ["question", "1. 求数列的最值。"],
      ["groupTitle", "【热点突破】"],
      ["groupTitle", "热点一 求数列和式的最值、范围"],
      ["question", "训练1 求数列的最大项。"],
    ]);
    expect(blocks[0].analysis).toBe("由单调性可得。");
  });
});

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

  it("preserves print-style vector markers in question text and options", () => {
    const blocks = parseDocumentBlocks(
      [
        '1. 已知向量 <i class="math-vector">a</i>，则 A. <i class="math-vector">a</i> B. <i class="math-vector">0</i> C. 1 D. 2',
        "答案：A",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: '1. 已知向量 <i class="math-vector">a</i>，则',
      options: [
        '<i class="math-vector">a</i>',
        '<i class="math-vector">0</i>',
        "1",
        "2",
      ],
      answer: "A",
    });
  });

  it.each([
    ["【解答】", "由等式两边同乘 2 得 x=2。"],
    ["【解答】由等式两边同乘 2 得 x=2。", null],
  ])("treats %s as an analysis marker", (analysisLine, continuation) => {
    const blocks = parseDocumentBlocks(
      [
        "1. 已知 x/2=1，求 x。",
        analysisLine,
        continuation,
      ].filter((line): line is string => Boolean(line)).join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "1. 已知 x/2=1，求 x。",
      analysis: "由等式两边同乘 2 得 x=2。",
    });
  });

  it.each(["4.", "４．"])("recognizes standalone question number %s after a summary", (number) => {
    const blocks = parseDocumentBlocks(
      [
        "3. 已知函数 f(x)，求其最小值。",
        "总结：注意定义域。",
        number,
        "已知集合 A={1,2}，写出其所有子集。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "3. 已知函数 f(x)，求其最小值。",
      summary: "注意定义域。",
    });
    expect(blocks[1]).toMatchObject({
      type: "question",
      content: `${number}\n已知集合 A={1,2}，写出其所有子集。`,
    });
  });

  it("keeps an established numbered list inside a summary", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 计算 1+1。",
        "总结：",
        "1. 先确定运算顺序。",
        "2.",
        "再进行计算。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      summary: "1. 先确定运算顺序。\n2.\n再进行计算。",
    });
  });

  it("recognizes bare option labels followed by whitespace", () => {
    const blocks = parseDocumentBlocks(
      [
        "一、单项选择题",
        "2. 设 a,b,c∈R，且 a>b，则下列不等式一定成立的是（ ）",
        "A a²>b²",
        "B ac²>bc²",
        "C a+c>b+c",
        "D. 1/a<1/b",
        "答案：C",
      ].join("\n"),
      config,
    );

    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "single",
      options: ["a²>b²", "ac²>bc²", "a+c>b+c", "1/a<1/b"],
      answer: "C",
    });
  });

  it("recognizes mixed bare and punctuated inline option labels", () => {
    const blocks = parseDocumentBlocks(
      [
        "一、单项选择题",
        "3. 请选择正确结论 A. 甲 B 乙 C、丙 D 丁",
        "答案：B",
      ].join("\n"),
      config,
    );

    expect(blocks[1]).toMatchObject({
      type: "question",
      content: "3. 请选择正确结论",
      options: ["甲", "乙", "丙", "丁"],
      answer: "B",
    });
  });

  it("does not treat bare variable names as options outside a choice section", () => {
    const blocks = parseDocumentBlocks(
      "1. 已知集合 A 是集合 B 的子集，且 B 是集合 C 的子集，证明 A 是集合 C 的子集。",
      config,
    );

    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "1. 已知集合 A 是集合 B 的子集，且 B 是集合 C 的子集，证明 A 是集合 C 的子集。",
      options: [],
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
    ["（本小题12分）1. 已知 x=1，求 x+1。", "1. 已知 x=1，求 x+1。"],
    ["1.（本题10分）已知 x=1，求 x+1。", "1.已知 x=1，求 x+1。"],
    ["２．（本题满分１０分）已知 x=1，求 x+1。", "２．已知 x=1，求 x+1。"],
    ["例3（本题共8分）已知 x=1，求 x+1。", "例3已知 x=1，求 x+1。"],
  ])("filters a leading score annotation from question text: %s", (source, expected) => {
    const blocks = parseDocumentBlocks(source, config);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: expected,
    });
  });

  it("drops a standalone score annotation before a question", () => {
    const blocks = parseDocumentBlocks(
      ["（本题满分10分）", "1. 已知 x=1，求 x+1。"].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "1. 已知 x=1，求 x+1。",
    });
  });

  it("keeps score wording when it is part of the question body", () => {
    const source = [
      "1. 某试卷的标注如下。",
      "（本题10分）",
      "判断这一表述是否规范。",
    ].join("\n");
    const blocks = parseDocumentBlocks(source, config);

    expect(blocks[0]).toMatchObject({
      type: "question",
      content: source,
    });
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

  it("keeps standalone numbered sub-question detail headings in analysis", () => {
    const blocks = parseDocumentBlocks(
      [
        "21. 已知函数 f(x)，完成下列各问。",
        "【解析】",
        "【分析】（1）先构造辅助函数并讨论单调性。",
        "（2）再利用根的关系完成证明。",
        "【小问 1 详解】",
        "先研究辅助函数的导数符号。",
        "【小问 2 详解】",
        "再代入边界条件得到结论。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      analysis: [
        "【小问 1 详解】",
        "先研究辅助函数的导数符号。",
        "【小问 2 详解】",
        "再代入边界条件得到结论。",
      ].join("\n"),
      summary: [
        "（1）先构造辅助函数并讨论单调性。",
        "（2）再利用根的关系完成证明。",
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
        "拓展题1证明两个奇数之和为偶数。",
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
      "拓展题1证明两个奇数之和为偶数。",
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

  it("separates a textbook section heading from its learning-objective knowledge block", () => {
    const blocks = parseDocumentBlocks(
      [
        "1.4.2 充要条件",
        "学习目标 通过对典型数学命题的梳理，理解充要条件的意义。",
        "理解数学定义与充要条件的关系。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "groupTitle",
      content: "1.4.2 充要条件",
    });
    expect(blocks[1]).toMatchObject({
      type: "knowledge",
      content: [
        "学习目标 通过对典型数学命题的梳理，理解充要条件的意义。",
        "理解数学定义与充要条件的关系。",
      ].join("\n"),
    });
  });

  it.each([
    "教学目标 理解充分条件与必要条件。",
    "教 学 目 标 理解充分条件与必要条件。",
    "【教学目标】理解充分条件与必要条件。",
    "学习目标 理解充分条件与必要条件。",
    "学 习 目 标 理解充分条件与必要条件。",
    "【学习目标】理解充分条件与必要条件。",
  ])("starts a knowledge block at objective label %s", (objectiveLine) => {
    const blocks = parseDocumentBlocks(
      ["1. 已知命题 p，判断其真假。", objectiveLine].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "question" });
    expect(blocks[1]).toMatchObject({
      type: "knowledge",
      content: objectiveLine,
    });
  });

  it.each([
    "引入 从生活中的分类现象认识集合。",
    "【引入】从生活中的分类现象认识集合。",
  ])("starts a knowledge block at lecture intro label %s", (introLine) => {
    const blocks = parseDocumentBlocks(
      [
        "例1 已知集合 A={1,2}，求元素个数。",
        "解析：直接数出集合中的元素即可。",
        introLine,
        "集合是由确定对象组成的整体。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "question" });
    expect(blocks[1]).toMatchObject({
      type: "knowledge",
      content: `${introLine}\n集合是由确定对象组成的整体。`,
    });
  });

  it("starts separate knowledge blocks at numbered angle and exploration labels", () => {
    const blocks = parseDocumentBlocks(
      [
        "例1 判断给定对象能否构成集合。",
        "解析：依据集合元素的确定性判断。",
        "角度1 描述法表示集合",
        "描述法适用于元素不便逐一列举的集合。",
        "角度２：列举法表示集合",
        "列举法适用于元素较少的集合。",
        "探究三 集合元素的互异性",
        "集合中的元素不能重复。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "question",
      "knowledge",
      "knowledge",
      "knowledge",
    ]);
    expect(blocks.slice(1).map((block) => block.content)).toEqual([
      "角度1 描述法表示集合\n描述法适用于元素不便逐一列举的集合。",
      "角度２：列举法表示集合\n列举法适用于元素较少的集合。",
      "探究三 集合元素的互异性\n集合中的元素不能重复。",
    ]);
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

  it("promotes an unnumbered prompt to a question when a following solution starts with 解", () => {
    const blocks = parseDocumentBlocks(
      [
        "【真题体验】",
        "(2021·新高考Ⅰ卷)已知数列 {an} 满足递推关系。",
        "(1) 写出偶数项子列的通项公式；",
        "(2) 求 {an} 的前 20 项和。",
        "解 (1) 由递推关系可得偶数项构成等差数列。",
        "所以可求得通项公式。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "groupTitle", content: "【真题体验】" });
    expect(blocks[1]).toMatchObject({
      type: "question",
      content: expect.stringContaining("(2021·新高考Ⅰ卷)已知数列"),
      analysis: "(1) 由递推关系可得偶数项构成等差数列。\n所以可求得通项公式。",
    });
  });

  it("promotes an unnumbered prompt when the following analysis uses 解析", () => {
    const blocks = parseDocumentBlocks(
      [
        "若函数 f(x) 满足给定条件，求参数 a 的范围。",
        "解析：由判别式非负可得参数约束。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      analysis: "由判别式非负可得参数约束。",
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

  it.each([
    "（1）解 由导数符号可知函数单调。",
    "（2）解析：由零点存在定理可得结论。",
    "①详解 根据题设整理即可。",
  ])(
    "treats numbered solution line %s as analysis when the stem contains a proof request",
    (solutionLine) => {
      const blocks = parseDocumentBlocks(
        [
          "18. 已知函数 f(x)，（1）证明 f(x) 在区间上单调；（2）求参数范围。",
          solutionLine,
          "所以命题成立。",
        ].join("\n"),
        config,
      );

      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toBe("18. 已知函数 f(x)，（1）证明 f(x) 在区间上单调；（2）求参数范围。");
      expect(blocks[0].analysis).toBe(`${solutionLine}\n所以命题成立。`);
    },
  );

  it("keeps a numbered 解 prompt in the stem when it is not a solution marker", () => {
    const blocks = parseDocumentBlocks(
      [
        "18. 已知函数 f(x)，完成下列各题。",
        "（1）解方程 f(x)=0；（2）证明 f(x)≥0。",
        "解析：分别使用方程与导数方法。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("（1）解方程 f(x)=0；（2）证明 f(x)≥0。");
    expect(blocks[0].analysis).toBe("分别使用方程与导数方法。");
  });

  it("splits independent numbered sub-questions with their own choices and answers", () => {
    const blocks = parseDocumentBlocks(
      [
        "训练1 （1）如果甲是乙的必要条件，丙是乙的充分条件，但不是乙的必要条件，那么（　） A. 丙是甲的充分不必要条件 B. 丙是甲的必要不充分条件 C. 丙是甲的充要条件 D. 丙是甲的既不充分又不必要条件 （2）设集合 A={x|x²+x-6=0}，B={x|mx-2=0}，则 B 是 A 的真子集的一个充分不必要条件是（　） A. m∈{0,2/3} B. m∈{0,-2/3} C. m∈{0,-2/3,1} D. m∈{0,2/3,1}",
        "答案：（1）A （2）B",
        "解析：（1）由条件关系可得 A。 （2）由集合包含关系可得 B。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "训练1 （1）如果甲是乙的必要条件，丙是乙的充分条件，但不是乙的必要条件，那么（　）",
      options: [
        "丙是甲的充分不必要条件",
        "丙是甲的必要不充分条件",
        "丙是甲的充要条件",
        "丙是甲的既不充分又不必要条件",
      ],
      answer: "A",
      analysis: "由条件关系可得 A。",
    });
    expect(blocks[1]).toMatchObject({
      type: "question",
      content: "（2）设集合 A={x|x²+x-6=0}，B={x|mx-2=0}，则 B 是 A 的真子集的一个充分不必要条件是（　）",
      options: [
        "m∈{0,2/3}",
        "m∈{0,-2/3}",
        "m∈{0,-2/3,1}",
        "m∈{0,2/3,1}",
      ],
      answer: "B",
      analysis: "由集合包含关系可得 B。",
    });
  });

  it("starts the next independent sub-question after the previous answer and analysis", () => {
    const blocks = parseDocumentBlocks(
      [
        "例1 （1）下列命题是真命题的是（　） A. 甲 B. 乙 C. 丙 D. 丁",
        "答案：D",
        "解析：逐项判断可知 D 正确。",
        "（2）（多选）下列命题为真命题的是（　） A. 戊 B. 己 C. 庚 D. 辛",
        "答案：BC",
        "解析：由定义可知 B、C 正确。",
        "（3）（多选）下列命题为真命题的是（　） A. 子 B. 丑 C. 寅 D. 卯",
        "答案：BCD",
        "解析：逐项验证可得 B、C、D。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.content)).toEqual([
      "例1 （1）下列命题是真命题的是（　）",
      "（2）（多选）下列命题为真命题的是（　）",
      "（3）（多选）下列命题为真命题的是（　）",
    ]);
    expect(blocks.map((block) => block.answer)).toEqual(["D", "BC", "BCD"]);
    expect(blocks.map((block) => block.analysis)).toEqual([
      "逐项判断可知 D 正确。",
      "由定义可知 B、C 正确。",
      "逐项验证可得 B、C、D。",
    ]);
  });

  it("splits screenshot-style sub-questions and distributes a shared multiline choice answer list", () => {
    const blocks = parseDocumentBlocks(
      [
        "例1 （1）下列命题是真命题的是（　） A. 甲 B. 乙 C. 丙 D. 丁",
        "答案：",
        "D",
        "BC",
        "BCD",
        "解析：对于 A、B、C 分别判断，只有 D 正确。",
        "（2）（多选）下列命题为真命题的是（　） A. 戊 B. 己 C. 庚 D. 辛",
        "解析：由定义可知 B、C 正确。",
        "（3）（多选）下列命题为真命题的是（　） A. 子 B. 丑 C. 寅 D. 卯",
        "解析：逐项验证可得 B、C、D。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.content)).toEqual([
      "例1 （1）下列命题是真命题的是（　）",
      "（2）（多选）下列命题为真命题的是（　）",
      "（3）（多选）下列命题为真命题的是（　）",
    ]);
    expect(blocks.map((block) => block.answer)).toEqual(["D", "BC", "BCD"]);
    expect(blocks.map((block) => block.analysis)).toEqual([
      "对于 A、B、C 分别判断，只有 D 正确。",
      "由定义可知 B、C 正确。",
      "逐项验证可得 B、C、D。",
    ]);
  });

  it("keeps numbered answer continuations before the next independent sub-question", () => {
    const blocks = parseDocumentBlocks(
      [
        "训练1 （1）第一小题 A. 甲 B. 乙 C. 丙 D. 丁",
        "答案：（1）A",
        "（2）B",
        "（2）第二小题 A. 戊 B. 己 C. 庚 D. 辛",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.answer)).toEqual(["A", "B"]);
    expect(blocks.map((block) => block.content)).toEqual([
      "训练1 （1）第一小题",
      "（2）第二小题",
    ]);
  });

  it("keeps sub-questions together when a shared stem precedes them", () => {
    const blocks = parseDocumentBlocks(
      [
        "19. 已知函数 f(x)=x²-2ax，完成下列各问。",
        "（1）当 a=1 时，求 f(x) 的最小值；",
        "（2）若 f(x)≥0 恒成立，求 a 的范围。",
        "答案：（1）-1；（2）a=0。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: [
        "19. 已知函数 f(x)=x²-2ax，完成下列各问。",
        "（1）当 a=1 时，求 f(x) 的最小值；",
        "（2）若 f(x)≥0 恒成立，求 a 的范围。",
      ].join("\n"),
      answer: "（1）-1；（2）a=0。",
    });
  });

  it("splits a trailing combined answer section across independent sub-questions", () => {
    const blocks = parseDocumentBlocks(
      [
        "训练11 （1）第一小题 A. 甲 B. 乙 C. 丙 D. 丁",
        "（2）第二小题 A. 戊 B. 己 C. 庚 D. 辛",
        "参考答案",
        "11. （1）A （2）B",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.answer)).toEqual(["A", "B"]);
    expect(blocks.map((block) => block.options)).toEqual([
      ["甲", "乙", "丙", "丁"],
      ["戊", "己", "庚", "辛"],
    ]);
  });

  it("keeps sequential roman-numeral sub-questions in the stem until an explicit answer or analysis marker", () => {
    const blocks = parseDocumentBlocks(
      [
        "19. 已知函数 f(x)，完成下列各问。",
        "（1）若 0<a<e^3，证明：f(x)<2f'(x)。",
        "（2）若两条曲线关于直线 y=x 对称，且方程有三个实根 x1<x2<x3。",
        "（i）求 a 的取值范围；",
        "（ii）证明：x1+x2+x3+3/a+3>0。",
        "答案：（1）证明见解析；（2）（i）(-1/2,0)；（ii）证明见解析。",
        "解析：分别利用导数与根的关系证明。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: [
        "19. 已知函数 f(x)，完成下列各问。",
        "（1）若 0<a<e^3，证明：f(x)<2f'(x)。",
        "（2）若两条曲线关于直线 y=x 对称，且方程有三个实根 x1<x2<x3。",
        "（i）求 a 的取值范围；",
        "（ii）证明：x1+x2+x3+3/a+3>0。",
      ].join("\n"),
      answer: "（1）证明见解析；（2）（i）(-1/2,0)；（ii）证明见解析。",
      analysis: "分别利用导数与根的关系证明。",
    });
  });

  it("keeps sequential proof sub-questions in the stem and numbered proof answers in the answer", () => {
    const blocks = parseDocumentBlocks(
      [
        "19. 已知函数 f(x)=4ax+axcosx-3sinx。",
        "(1) 当 a=1 时，求 f(x) 在点 (0,f(0)) 处的切线方程；",
        "(2) 当 a≥3/5 时，证明：对任意 x≥0，都有 f(x)≥0；",
        "(3) 证明：sum(sin(1/(k+2)))<ln(n+1)。",
        "【答案】(1) y=2x",
        "(2) 证明见解析",
        "(3) 证明见解析",
        "【解析】(1) 利用导数的几何意义可得所求切线方程。",
        "(2) 构造函数并利用单调性证明。",
        "(3) 利用放缩法证明。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: [
        "19. 已知函数 f(x)=4ax+axcosx-3sinx。",
        "(1) 当 a=1 时，求 f(x) 在点 (0,f(0)) 处的切线方程；",
        "(2) 当 a≥3/5 时，证明：对任意 x≥0，都有 f(x)≥0；",
        "(3) 证明：sum(sin(1/(k+2)))<ln(n+1)。",
      ].join("\n"),
      answer: [
        "(1) y=2x",
        "(2) 证明见解析",
        "(3) 证明见解析",
      ].join("\n"),
      analysis: [
        "(1) 利用导数的几何意义可得所求切线方程。",
        "(2) 构造函数并利用单调性证明。",
        "(3) 利用放缩法证明。",
      ].join("\n"),
    });
  });

  it("keeps the last essay sub-question in the stem and maps a noisy trailing reference-answer section", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 第一题 A. 甲 B. 乙 C. 丙 D. 丁",
        "2. 第二题 A. 甲 B. 乙 C. 丙 D. 丁",
        "19. 已知函数 f(x)，且存在 x0 使 f(x0)=x0。",
        "（1）证明：f(x) 是 R 上的单调增函数；",
        "（2）设 xn、yn 满足给定递推关系，证明 xn<xn+1<x0<yn+1<yn；",
        "（3）证明：(yn+1-xn+1)/(yn-xn)<1/2。",
        "参\u200b考答案",
        "1. B",
        "2. C",
        "19. 【答案】（1）证明见解析；（2）证明见解析；（3）证明见解析。",
        "【解析】分别利用导数、单调性与递推关系完成证明。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[2]).toMatchObject({
      type: "question",
      content: [
        "19. 已知函数 f(x)，且存在 x0 使 f(x0)=x0。",
        "（1）证明：f(x) 是 R 上的单调增函数；",
        "（2）设 xn、yn 满足给定递推关系，证明 xn<xn+1<x0<yn+1<yn；",
        "（3）证明：(yn+1-xn+1)/(yn-xn)<1/2。",
      ].join("\n"),
      answer: "（1）证明见解析；（2）证明见解析；（3）证明见解析。",
      analysis: "分别利用导数、单调性与递推关系完成证明。",
    });
    expect(blocks.map((block) => block.answer)).toEqual([
      "B",
      "C",
      "（1）证明见解析；（2）证明见解析；（3）证明见解析。",
    ]);
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
    "思维升华：判断对象能否构成集合时先检查确定性。",
    "【思维升华】判断对象能否构成集合时先检查确定性。",
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

    expect(blocks[0].summary).toMatch(/判断对象能否构成集合|注意等价转化|不要漏掉端点/);
  });

  it("keeps sequential numbered summary items in the same question", () => {
    const blocks = parseDocumentBlocks(
      [
        "7. 已知数列满足递推关系，求其通项公式。",
        "解析：先分别研究奇数项和偶数项。",
        "总结：1. 构造隔项等差数列：两式相减得到公差。",
        "2. 构造隔项等比数列：两式相除得到公比。",
        "8. 已知另一数列，求其前 n 项和。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "question",
      content: "7. 已知数列满足递推关系，求其通项公式。",
      summary: [
        "1. 构造隔项等差数列：两式相减得到公差。",
        "2. 构造隔项等比数列：两式相除得到公比。",
      ].join("\n"),
    });
    expect(blocks[1]).toMatchObject({
      type: "question",
      content: "8. 已知另一数列，求其前 n 项和。",
    });
  });

  it("keeps a numbered list in summary even when the summary starts with unnumbered text", () => {
    const blocks = parseDocumentBlocks(
      [
        "7. 已知数列满足递推关系，求其通项公式。",
        "【分析】",
        "先把解题过程归纳为两个步骤。",
        "1. 构造隔项等差数列并求公差。",
        "2. 构造隔项等比数列并求公比。",
        "8. 已知另一数列，求其前 n 项和。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "question",
      summary: [
        "先把解题过程归纳为两个步骤。",
        "1. 构造隔项等差数列并求公差。",
        "2. 构造隔项等比数列并求公比。",
      ].join("\n"),
    });
    expect(blocks[1]).toMatchObject({
      type: "question",
      content: "8. 已知另一数列，求其前 n 项和。",
    });
  });

  it("still starts the expected next question after a numbered summary item", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 已知数列满足递推关系，求其通项公式。",
        "总结：1. 先识别递推关系的结构。",
        "2. 已知另一数列满足 $a_{n+1}=2a_n$，求 $a_n$。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "question",
      summary: "1. 先识别递推关系的结构。",
    });
    expect(blocks[1]).toMatchObject({
      type: "question",
      content: "2. 已知另一数列满足 $a_{n+1}=2a_n$，求 $a_n$。",
    });
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

  it("classifies lecture intro and knowledge review labels as project group titles", () => {
    const blocks = parseDocumentBlocks(
      [
        "高一升高二讲义 第13讲",
        "课前引入",
        "立体几何初步是本讲的核心内容。",
        "知识梳理",
        "考向一 空间角的计算",
        "例1 求异面直线所成角。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => [block.type, block.content])).toEqual([
      ["documentTitle", "高一升高二讲义 第13讲"],
      ["groupTitle", "课前引入"],
      ["knowledge", "立体几何初步是本讲的核心内容。"],
      ["groupTitle", "知识梳理"],
      ["groupTitle", "考向一 空间角的计算"],
      ["question", "例1 求异面直线所成角。"],
    ]);
  });

  it.each([
    "练习",
    "练习题",
    "训练",
    "拓展",
    "拓展提升",
    "提升练习",
    "提升训练",
  ])("classifies standalone %s as a project group title", (projectHeading) => {
    const blocks = parseDocumentBlocks(
      [
        "例1 已知数列满足递推关系，求其通项公式。",
        projectHeading,
        "例2 已知另一数列，求其通项公式。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => [block.type, block.content])).toEqual([
      ["question", "例1 已知数列满足递推关系，求其通项公式。"],
      ["groupTitle", projectHeading],
      ["question", "例2 已知另一数列，求其通项公式。"],
    ]);
  });

  it.each([
    "A组",
    "B组",
    "Ｃ组",
    "课后训练",
    "课后训练巩固提升",
  ])("classifies %s as a project group title", (projectHeading) => {
    const blocks = parseDocumentBlocks(
      [
        "例1 已知空间向量 a、b，求 a+b。",
        projectHeading,
        "1. 已知空间四边形 ABCD，求向量 CD。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => [block.type, block.content])).toEqual([
      ["question", "例1 已知空间向量 a、b，求 a+b。"],
      ["groupTitle", projectHeading],
      ["question", "1. 已知空间四边形 ABCD，求向量 CD。"],
    ]);
  });

  it.each([
    "练习1 求数列的最大项。",
    "练习题1 求数列的最小项。",
    "训练1 求数列的通项公式。",
    "拓展1 求数列的前 n 项和。",
    "拓展题1 求数列的最值。",
  ])("keeps numbered %s as a question", (questionLine) => {
    const blocks = parseDocumentBlocks(questionLine, config);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "question", content: questionLine });
  });

  it.each([
    "考向1 $a_{n+1}=pa_n+q^n$",
    "考向２：递推数列的构造",
    "考向三 数列通项公式的求法",
    "题型一 数列递推关系",
    "题型二 由递推求通项",
    "类型1 等差数列综合题",
    "类型二 数列与函数综合",
  ])("classifies %s as a project or question-type title", (projectHeading) => {
    const blocks = parseDocumentBlocks(
      [
        "例1 已知数列满足递推关系，求其通项公式。",
        "解析：先利用构造法完成前一题。",
        projectHeading,
        "例2 已知另一数列，求其通项公式。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => [block.type, block.content])).toEqual([
      ["question", "例1 已知数列满足递推关系，求其通项公式。"],
      ["groupTitle", projectHeading],
      ["question", "例2 已知另一数列，求其通项公式。"],
    ]);
    expect(blocks[0].analysis).toBe("先利用构造法完成前一题。");
  });

  it.each([
    ["反思", "反思 先判断递推关系的类型，再选择构造方法。"],
    ["反思感悟", "反思感悟 先化简再观察结构。"],
    ["感悟", "感悟：复杂递推式应优先寻找不变量。"],
    ["【反思】", "【反思】 本题容易忽略首项条件。"],
  ])("treats %s as a summary marker instead of a project title", (_label, summaryLine) => {
    const blocks = parseDocumentBlocks(
      [
        "例1 已知数列满足递推关系，求其通项公式。",
        "解析：先完成递推式变形。",
        summaryLine,
        "题型一 递推数列",
        "例2 已知另一数列，求其通项公式。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "question",
      "groupTitle",
      "question",
    ]);
    expect(blocks[0].summary).toBe(summaryLine
      .replace(/^反思感悟\s*/, "")
      .replace(/^反思\s*/, "")
      .replace(/^感悟\s*[:：]?\s*/, "")
      .replace(/^【反思】\s*/, ""));
  });

  it("keeps content after a standalone bracketed reflection marker in the question summary", () => {
    const blocks = parseDocumentBlocks(
      [
        "例1 已知数列满足递推关系，求其通项公式。",
        "解析：先完成递推式变形。",
        "【反思】",
        "本题容易忽略首项条件。",
        "题型二 递推数列变式",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "question",
      summary: "本题容易忽略首项条件。",
    });
    expect(blocks[1]).toMatchObject({
      type: "groupTitle",
      content: "题型二 递推数列变式",
    });
  });

  it("does not treat a word beginning with 题型一 as a project title without a separator", () => {
    const blocks = parseDocumentBlocks(
      [
        "题型一元二次方程需要先判断判别式。",
        "题型一 二次方程基础",
        "例1 求方程的根。",
      ].join("\n"),
      config,
    );

    expect(blocks.map((block) => [block.type, block.content])).toEqual([
      ["documentTitle", "题型一元二次方程需要先判断判别式。"],
      ["groupTitle", "题型一 二次方程基础"],
      ["question", "例1 求方程的根。"],
    ]);
  });
});

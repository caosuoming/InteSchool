import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, convertInchesToTwip,
} from "docx";
import { saveAs } from "file-saver";
import type { Question } from "@/types";
import { getDefaultQuestionTypeLabel } from "@/lib/question-types";

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

function createParagraph(
  text: string,
  options: {
    bold?: boolean;
    size?: number;
    color?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacing?: { before?: number; after?: number; line?: number };
  } = {},
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options.bold,
        size: options.size,
        color: options.color,
        font: "宋体",
      }),
    ],
    alignment: options.alignment,
    spacing: options.spacing,
  });
}

function createLabeledParagraph(label: string, content: string, labelColor = "0B2545"): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `【${label}】`,
        bold: true,
        color: labelColor,
        font: "宋体",
        size: 22,
      }),
      new TextRun({
        text: content,
        font: "宋体",
        size: 22,
      }),
    ],
    spacing: { line: 360 },
  });
}

function createHeading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}

function createOptionsTable(options: string[]): Table {
  const rows: TableRow[] = [];
  const half = Math.ceil(options.length / 2);

  for (let i = 0; i < half; i++) {
    const cells: TableCell[] = [];
    const leftIdx = i;
    const rightIdx = i + half;

    cells.push(
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${String.fromCharCode(65 + leftIdx)}. `,
                bold: true,
                font: "宋体",
                size: 22,
              }),
              new TextRun({
                text: options[leftIdx],
                font: "宋体",
                size: 22,
              }),
            ],
            spacing: { line: 360 },
          }),
        ],
      }),
    );

    if (rightIdx < options.length) {
      cells.push(
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: `${String.fromCharCode(65 + rightIdx)}. `,
                  bold: true,
                  font: "宋体",
                  size: 22,
                }),
                new TextRun({
                  text: options[rightIdx],
                  font: "宋体",
                  size: 22,
                }),
              ],
              spacing: { line: 360 },
            }),
          ],
        }),
      );
    } else {
      cells.push(
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
          children: [],
        }),
      );
    }

    rows.push(new TableRow({ children: cells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export async function generateQuestionDocx(
  question: Question,
  options: {
    chapterNames?: string[];
    pointNames?: string[];
    remarks?: string[];
  } = {},
): Promise<void> {
  const { chapterNames = [], pointNames = [], remarks = [] } = options;

  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      text: "题目详情",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  );

  const metaParts: string[] = [];
  metaParts.push(`题型：${getDefaultQuestionTypeLabel(question.type)}`);
  metaParts.push(`难度：${difficultyLabel[question.difficulty]}`);
  if (question.grade) metaParts.push(`年级：${question.grade}`);
  if (question.schoolYear) metaParts.push(`学年：${question.schoolYear}`);
  if (question.sourceType) metaParts.push(`来源：${question.sourceType}`);

  children.push(
    createParagraph(metaParts.join("    "), {
      color: "6B7280",
      size: 20,
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
  );

  children.push(createHeading("题干"));
  children.push(createParagraph(question.stem, { spacing: { line: 360 } }));

  if (question.options && question.options.length > 0) {
    children.push(createHeading("选项"));
    children.push(createOptionsTable(question.options));
  }

  children.push(createHeading("答案"));
  children.push(
    createParagraph(question.answer, {
      bold: true,
      color: "059669",
      spacing: { line: 360 },
    }),
  );

  children.push(createHeading("解析"));
  children.push(createParagraph(question.analysis, { spacing: { line: 360 } }));

  if (chapterNames.length > 0 || pointNames.length > 0) {
    children.push(createHeading("关联信息"));
    if (chapterNames.length > 0) {
      children.push(createLabeledParagraph("章节", chapterNames.join("、")));
    }
    if (pointNames.length > 0) {
      children.push(createLabeledParagraph("知识点", pointNames.join("、")));
    }
  }

  if (remarks.length > 0) {
    children.push(createHeading("教师备注"));
    remarks.forEach((remark, idx) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${idx + 1}. `,
              bold: true,
              color: "D4A24C",
              font: "宋体",
              size: 22,
            }),
            new TextRun({
              text: remark,
              font: "宋体",
              size: 22,
            }),
          ],
          spacing: { line: 360 },
        }),
      );
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `题目_${question.id}.docx`;
  saveAs(blob, fileName);
}

export async function generateQuestionsDocx(
  questions: Question[],
  options: {
    title?: string;
    chapterMap?: Map<string, string>;
    knowledgeMap?: Map<string, string>;
    includeAnswers?: boolean;
  } = {},
): Promise<void> {
  const {
    title = "题目列表",
    includeAnswers = true,
  } = options;

  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
  );

  children.push(
    createParagraph(`共 ${questions.length} 道题目`, {
      color: "6B7280",
      size: 20,
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
    }),
  );

  questions.forEach((question, qIndex) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${qIndex + 1}. `,
            bold: true,
            font: "宋体",
            size: 24,
          }),
          new TextRun({
            text: `[${getDefaultQuestionTypeLabel(question.type)}] [${difficultyLabel[question.difficulty]}]`,
            color: "6B7280",
            size: 20,
            font: "宋体",
          }),
        ],
        spacing: { before: 360, after: 120 },
      }),
    );

    children.push(createParagraph(question.stem, { spacing: { line: 360 } }));

    if (question.options && question.options.length > 0) {
      children.push(createOptionsTable(question.options));
    }

    if (includeAnswers) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "答案：",
              bold: true,
              color: "059669",
              font: "宋体",
              size: 22,
            }),
            new TextRun({
              text: question.answer,
              color: "059669",
              font: "宋体",
              size: 22,
            }),
          ],
          spacing: { before: 120, line: 360 },
        }),
      );

      if (question.analysis) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "解析：",
                bold: true,
                color: "D4A24C",
                font: "宋体",
                size: 22,
              }),
              new TextRun({
                text: question.analysis,
                font: "宋体",
                size: 22,
              }),
            ],
            spacing: { line: 360 },
          }),
        );
      }
    }

    children.push(
      new Paragraph({
        children: [],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
        },
        spacing: { before: 240, after: 240 },
      }),
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${title}_${new Date().toISOString().slice(0, 10)}.docx`;
  saveAs(blob, fileName);
}
